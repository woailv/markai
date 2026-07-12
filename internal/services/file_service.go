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
type FileService struct{}

// NewFileService 构造函数。
func NewFileService() *FileService {
	return &FileService{}
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
func (s *FileService) Write(in WriteFileInput) (*WriteFileResult, error) {
	abs, err := requireAbs(in.Path)
	if err != nil {
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

// Move 移动或重命名文件/目录。目标已存在则报错。
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
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("file: mkdir parent %q: %w", dst, err)
	}
	if err := os.Rename(src, dst); err != nil {
		return fmt.Errorf("file: move %q -> %q: %w", src, dst, err)
	}
	return nil
}

// Delete 删除文件或空目录;若是目录会递归删除。
func (s *FileService) Delete(path string) error {
	abs, err := requireAbs(path)
	if err != nil {
		return err
	}
	if _, err := os.Stat(abs); err != nil {
		return fmt.Errorf("file: stat %q: %w", abs, err)
	}
	if err := os.RemoveAll(abs); err != nil {
		return fmt.Errorf("file: delete %q: %w", abs, err)
	}
	return nil
}

// CreateDirectory 创建目录,包含所有必要的父目录。
func (s *FileService) CreateDirectory(path string) error {
	abs, err := requireAbs(path)
	if err != nil {
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