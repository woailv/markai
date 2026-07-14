package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// FileService 提供文件与目录的基础操作,暴露给前端调用。
// 所有路径要求绝对路径,内部会做 Clean 归一化。
// 若入参中提供 batchID,写/删/移动前会调用 SnapshotService 登记原始状态,
// 便于后续按批次撤销。
type FileService struct {
	snapshots *SnapshotService
}

// NewFileService 构造函数。snapshots 可为 nil(不启用快照)。
func NewFileService(snapshots *SnapshotService) *FileService {
	return &FileService{snapshots: snapshots}
}

// recordSnapshot 若 batchID 有效且 snapshots 已注入,登记单个路径。
func (s *FileService) recordSnapshot(batchID uint64, absPath string) error {
	if batchID == 0 || s.snapshots == nil {
		return nil
	}
	return s.snapshots.recordIfNeeded(batchID, absPath)
}

// GenerateTree 为选定的文件或目录生成类似 tree 命令的结构文本。
func (s *FileService) GenerateTree(in GenerateTreeInput) (*GenerateTreeResult, error) {
	if in.MaxDepth <= 0 {
		in.MaxDepth = 3 // 默认限制 3 层深度，兼顾 LLM Token 消耗与性能
	}
	var sb strings.Builder
	for i, p := range in.Paths {
		abs, err := requireAbs(p)
		if err != nil {
			continue
		}
		stat, err := os.Stat(abs)
		if err != nil {
			continue
		}

		if i > 0 {
			sb.WriteString("\n")
		}

		sb.WriteString(filepath.Base(abs))
		if stat.IsDir() {
			sb.WriteString("/\n")
			s.buildTree(&sb, abs, "", 1, in.MaxDepth)
		} else {
			sb.WriteString("\n")
		}
	}
	return &GenerateTreeResult{TreeText: sb.String()}, nil
}

// buildTree 递归构建目录树文本，带有深度限制防抖。
func (s *FileService) buildTree(sb *strings.Builder, dirPath string, prefix string, currentDepth, maxDepth int) {
	if currentDepth > maxDepth {
		sb.WriteString(prefix + "└── ... (已达到最大深度)\n")
		return
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		sb.WriteString(prefix + "└── (error reading directory)\n")
		return
	}

	var valid []os.DirEntry
	for _, e := range entries {
		// 默认过滤隐藏文件
		if !strings.HasPrefix(e.Name(), ".") {
			valid = append(valid, e)
		}
	}
	sort.Slice(valid, func(i, j int) bool {
		if valid[i].IsDir() != valid[j].IsDir() {
			return valid[i].IsDir()
		}
		return strings.ToLower(valid[i].Name()) < strings.ToLower(valid[j].Name())
	})

	for i, e := range valid {
		isLast := i == len(valid)-1
		marker := "├── "
		if isLast {
			marker = "└── "
		}

		sb.WriteString(prefix)
		sb.WriteString(marker)
		sb.WriteString(e.Name())
		if e.IsDir() {
			sb.WriteString("/")
		}
		sb.WriteString("\n")

		if e.IsDir() {
			newPrefix := prefix + "│   "
			if isLast {
				newPrefix = prefix + "    "
			}
			s.buildTree(sb, filepath.Join(dirPath, e.Name()), newPrefix, currentDepth+1, maxDepth)
		}
	}
}

// Read 读取文件内容。
func (s *FileService) Read(path string) (*ReadFileResult, error) {
	abs, err := requireAbs(path)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return nil, fmt.Errorf("file: read %q: %w", abs, err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("file: stat %q: %w", abs, err)
	}
	return &ReadFileResult{
		Path:    abs,
		Content: string(data),
		Size:    info.Size(),
	}, nil
}

// Write 写入文件内容,自动创建父目录。
// 返回是否为新建以及 unified diff(与旧内容对比)。
// 若 in.BatchID != 0,写盘前会登记原始状态用于撤销。
func (s *FileService) Write(in WriteFileInput) (*WriteFileResult, error) {
	abs, err := requireAbs(in.Path)
	if err != nil {
		return nil, err
	}

	if err := s.recordSnapshot(in.BatchID, abs); err != nil {
		return nil, err
	}

	var (
		oldContent string
		created    bool
	)
	existing, statErr := os.Stat(abs)
	switch {
	case statErr == nil:
		if existing.IsDir() {
			return nil, fmt.Errorf("file: write %q: is a directory", abs)
		}
		data, readErr := os.ReadFile(abs)
		if readErr != nil {
			return nil, fmt.Errorf("file: read existing %q: %w", abs, readErr)
		}
		oldContent = string(data)
	case errors.Is(statErr, os.ErrNotExist):
		created = true
	default:
		return nil, fmt.Errorf("file: stat %q: %w", abs, statErr)
	}

	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return nil, fmt.Errorf("file: mkdir parent %q: %w", abs, err)
	}
	// 若目标文件存在且只读,先清除只读属性,否则 Windows 上会 Access is denied。
	if !created {
		if err := clearReadOnly(abs); err != nil {
			return nil, fmt.Errorf("file: clear readonly %q: %w", abs, err)
		}
	}
	if err := os.WriteFile(abs, []byte(in.Content), 0o644); err != nil {
		return nil, fmt.Errorf("file: write %q: %w", abs, err)
	}

	diff := unifiedDiff(abs, abs, oldContent, in.Content, created)
	return &WriteFileResult{
		Path:    abs,
		Created: created,
		Diff:    diff,
	}, nil
}

// Rename 在同一父目录内重命名文件/目录。
// 若 newName 与原名相同,静默返回;若目标已存在,报错;若目标只读,会先清除只读属性。
// 若 in.BatchID != 0,登记原路径与新路径的原始状态。
func (s *FileService) Rename(in RenameInput) (*RenameResult, error) {
	src, err := requireAbs(in.Path)
	if err != nil {
		return nil, fmt.Errorf("file: source: %w", err)
	}
	newName := strings.TrimSpace(in.NewName)
	if newName == "" {
		return nil, errors.New("file: new name required")
	}
	if strings.ContainsAny(newName, `\/:*?"<>|`) {
		return nil, fmt.Errorf("file: invalid name %q", newName)
	}
	oldName := filepath.Base(src)
	if oldName == newName {
		return &RenameResult{Path: src, OldPath: src, Renamed: false}, nil
	}
	dst := filepath.Join(filepath.Dir(src), newName)
	if _, err := os.Stat(src); err != nil {
		return nil, fmt.Errorf("file: stat source %q: %w", src, err)
	}
	if _, err := os.Stat(dst); err == nil {
		return nil, fmt.Errorf("file: destination %q already exists", dst)
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("file: stat destination %q: %w", dst, err)
	}
	if err := s.recordSnapshot(in.BatchID, src); err != nil {
		return nil, err
	}
	if err := s.recordSnapshot(in.BatchID, dst); err != nil {
		return nil, err
	}
	// 只读属性下 Rename 也会失败(Windows),先清除。
	if err := clearReadOnly(src); err != nil {
		return nil, fmt.Errorf("file: clear readonly %q: %w", src, err)
	}
	if err := os.Rename(src, dst); err != nil {
		return nil, fmt.Errorf("file: rename %q -> %q: %w", src, dst, err)
	}
	return &RenameResult{Path: dst, OldPath: src, Renamed: true}, nil
}

// Move 移动或重命名文件/目录。目标已存在则报错。
// 若 in.BatchID != 0,会同时登记 source(存在) 与 destination(不存在) 的原始状态。
func (s *FileService) Move(in MovePathInput) error {
	src, err := requireAbs(in.Source)
	if err != nil {
		return fmt.Errorf("file: source: %w", err)
	}
	dst, err := requireAbs(in.Destination)
	if err != nil {
		return fmt.Errorf("file: destination: %w", err)
	}
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("file: stat source %q: %w", src, err)
	}
	if _, err := os.Stat(dst); err == nil {
		return fmt.Errorf("file: destination %q already exists", dst)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("file: stat destination %q: %w", dst, err)
	}
	// 快照 source 与 destination(destination 应为 not exist 状态)
	if err := s.recordSnapshot(in.BatchID, src); err != nil {
		return err
	}
	if err := s.recordSnapshot(in.BatchID, dst); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("file: mkdir parent %q: %w", dst, err)
	}
	if err := os.Rename(src, dst); err != nil {
		return fmt.Errorf("file: move %q -> %q: %w", src, dst, err)
	}
	return nil
}

// Delete 删除文件或空目录;若是目录会递归删除。
// 保留原有签名以兼容旧调用;带批次撤销能力请使用 DeleteWithBatch。
func (s *FileService) Delete(path string) error {
	return s.DeleteWithBatch(DeleteInput{Path: path})
}

// DeleteWithBatch 与 Delete 语义一致,额外支持关联快照批次。
func (s *FileService) DeleteWithBatch(in DeleteInput) error {
	abs, err := requireAbs(in.Path)
	if err != nil {
		return err
	}
	if _, err := os.Stat(abs); err != nil {
		return fmt.Errorf("file: stat %q: %w", abs, err)
	}
	if err := s.recordSnapshot(in.BatchID, abs); err != nil {
		return err
	}
	if err := os.RemoveAll(abs); err != nil {
		return fmt.Errorf("file: delete %q: %w", abs, err)
	}
	return nil
}

// CreateDirectory 创建目录,包含所有必要的父目录。
// 保留原有签名以兼容旧调用;带批次撤销能力请使用 CreateDirectoryWithBatch。
func (s *FileService) CreateDirectory(path string) error {
	return s.CreateDirectoryWithBatch(CreateDirectoryInput{Path: path})
}

// CreateDirectoryWithBatch 与 CreateDirectory 语义一致,额外支持关联快照批次。
func (s *FileService) CreateDirectoryWithBatch(in CreateDirectoryInput) error {
	abs, err := requireAbs(in.Path)
	if err != nil {
		return err
	}
	if err := s.recordSnapshot(in.BatchID, abs); err != nil {
		return err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return fmt.Errorf("file: mkdir %q: %w", abs, err)
	}
	return nil
}

// List 列出目录内容(非递归),目录在前、名称升序。
func (s *FileService) List(path string) ([]FileEntry, error) {
	abs, err := requireAbs(path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, fmt.Errorf("file: list %q: %w", abs, err)
	}
	result := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		info, infoErr := e.Info()
		if infoErr != nil {
			return nil, fmt.Errorf("file: stat entry %q: %w", e.Name(), infoErr)
		}
		result = append(result, FileEntry{
			Name:    e.Name(),
			Path:    filepath.Join(abs, e.Name()),
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime().Unix(),
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// requireAbs 校验路径非空且为绝对路径,并返回 Clean 后的形式。
func requireAbs(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", errors.New("file: path required")
	}
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("file: path must be absolute: %q", p)
	}
	return filepath.Clean(p), nil
}