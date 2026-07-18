package services

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// PasteFromClipboardResult 描述一次剪贴板粘贴的结果。
// Written 为写入到目标目录的绝对路径列表;Cut 表示是否按剪切语义执行(源已被删除)。
type PasteFromClipboardResult struct {
	Written []string `json:"written"`
	Cut     bool     `json:"cut"`
}

// PasteFromClipboard 从系统剪贴板读取文件路径,并粘贴到 workspaceDir。
// - 若剪贴板不含文件路径,返回空 Written 与 nil 错误(调用方可据此提示或降级)。
// - 剪切语义由剪贴板自身携带(Windows 下的 Preferred DropEffect);
//   在支持的平台上,粘贴成功后会删除源文件。
// - 目标同名自动重命名,规则与 CopyPathsToWorkspace 保持一致。
func (s *FileService) PasteFromClipboard(workspaceDir string) (*PasteFromClipboardResult, error) {
	clip := NewClipboardService()
	cp, err := clip.ReadPaths()
	if err != nil {
		return nil, err
	}
	if cp == nil || len(cp.Paths) == 0 {
		return &PasteFromClipboardResult{Written: []string{}, Cut: false}, nil
	}
	written, err := s.CopyPathsToWorkspace(cp.Paths, workspaceDir, cp.Cut)
	if err != nil {
		return &PasteFromClipboardResult{Written: written, Cut: cp.Cut}, err
	}
	return &PasteFromClipboardResult{Written: written, Cut: cp.Cut}, nil
}

// CopyPathsToWorkspace 将 srcPaths 中的每个文件/目录复制到 workspaceDir。
// Cut=true 时,单项复制成功后立即删除对应源(剪切语义)。
// 目标同名自动重命名为 "name (1).ext"、"name (2).ext" 等。
// 任一源失败即中止,返回此前已成功写入的目标绝对路径与错误。
func (s *FileService) CopyPathsToWorkspace(srcPaths []string, workspaceDir string, cut bool) ([]string, error) {
	wsAbs, err := requireAbs(workspaceDir)
	if err != nil {
		return nil, fmt.Errorf("file: workspace: %w", err)
	}
	wsInfo, err := os.Stat(wsAbs)
	if err != nil {
		return nil, fmt.Errorf("file: stat workspace %q: %w", wsAbs, err)
	}
	if !wsInfo.IsDir() {
		return nil, fmt.Errorf("file: workspace %q is not a directory", wsAbs)
	}

	written := make([]string, 0, len(srcPaths))
	for _, raw := range srcPaths {
		src, err := requireAbs(raw)
		if err != nil {
			return written, fmt.Errorf("file: source: %w", err)
		}
		info, err := os.Stat(src)
		if err != nil {
			return written, fmt.Errorf("file: stat source %q: %w", src, err)
		}

		candidate := filepath.Join(wsAbs, filepath.Base(src))
		if err := ensureInside(wsAbs, candidate); err != nil {
			return written, err
		}
		dst := uniqueDest(candidate)
		if err := ensureInside(wsAbs, dst); err != nil {
			return written, err
		}

		if info.IsDir() {
			if err := copyDir(src, dst); err != nil {
				return written, fmt.Errorf("file: copy dir %q -> %q: %w", src, dst, err)
			}
		} else {
			if err := copyFile(src, dst); err != nil {
				return written, fmt.Errorf("file: copy file %q -> %q: %w", src, dst, err)
			}
		}

		if cut {
			if err := os.RemoveAll(src); err != nil {
				return written, fmt.Errorf("file: remove source %q after cut: %w", src, err)
			}
		}
		written = append(written, dst)
	}
	return written, nil
}

// WriteBytesToWorkspace 将字节流写入 workspaceDir 下的 fileName。
// fileName 必须为纯文件名,不允许包含路径分隔符或 "..";同名自动重命名。
func (s *FileService) WriteBytesToWorkspace(fileName string, data []byte, workspaceDir string) (string, error) {
	name := strings.TrimSpace(fileName)
	if name == "" {
		return "", errors.New("file: fileName required")
	}
	if strings.ContainsAny(name, `/\`) || name == "." || name == ".." || strings.Contains(name, "..") {
		return "", fmt.Errorf("file: invalid fileName %q", name)
	}

	wsAbs, err := requireAbs(workspaceDir)
	if err != nil {
		return "", fmt.Errorf("file: workspace: %w", err)
	}
	wsInfo, err := os.Stat(wsAbs)
	if err != nil {
		return "", fmt.Errorf("file: stat workspace %q: %w", wsAbs, err)
	}
	if !wsInfo.IsDir() {
		return "", fmt.Errorf("file: workspace %q is not a directory", wsAbs)
	}

	candidate := filepath.Join(wsAbs, name)
	if err := ensureInside(wsAbs, candidate); err != nil {
		return "", err
	}
	dst := uniqueDest(candidate)
	if err := ensureInside(wsAbs, dst); err != nil {
		return "", err
	}

	f, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("file: create %q: %w", dst, err)
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(dst)
		return "", fmt.Errorf("file: write %q: %w", dst, err)
	}
	if err := f.Close(); err != nil {
		return "", fmt.Errorf("file: close %q: %w", dst, err)
	}
	return dst, nil
}

// uniqueDest 若 path 已存在,返回 "name (1).ext"、"name (2).ext" 等首个不冲突路径。
// 对目录同样适用:目录名整体作为 base,无扩展名部分。
func uniqueDest(path string) string {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return path
	}
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)

	for i := 1; ; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
}

// copyFile 流式复制单个文件,保留源文件权限。
// dst 必须不存在(调用方通过 uniqueDest 保证)。
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open src: %w", err)
	}
	defer in.Close()

	info, err := in.Stat()
	if err != nil {
		return fmt.Errorf("stat src: %w", err)
	}
	if info.IsDir() {
		return fmt.Errorf("source %q is a directory", src)
	}

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("mkdir parent: %w", err)
	}

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, info.Mode().Perm())
	if err != nil {
		return fmt.Errorf("create dst: %w", err)
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return fmt.Errorf("copy: %w", err)
	}
	if err := out.Close(); err != nil {
		return fmt.Errorf("close dst: %w", err)
	}
	return nil
}

// copyDir 递归复制目录,保留文件权限。dst 必须不存在。
func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("stat src: %w", err)
	}
	if !srcInfo.IsDir() {
		return fmt.Errorf("source %q is not a directory", src)
	}
	if err := os.MkdirAll(dst, srcInfo.Mode().Perm()); err != nil {
		return fmt.Errorf("mkdir dst: %w", err)
	}

	return filepath.WalkDir(src, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk %q: %w", path, walkErr)
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return fmt.Errorf("rel %q: %w", path, err)
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)

		if d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return fmt.Errorf("info %q: %w", path, err)
			}
			if err := os.MkdirAll(target, info.Mode().Perm()); err != nil {
				return fmt.Errorf("mkdir %q: %w", target, err)
			}
			return nil
		}
		// 符号链接与其他非常规文件:按普通文件流式复制其内容(足够满足工作区导入场景)。
		return copyFile(path, target)
	})
}

// ensureInside 校验 target 必须位于 base 目录内(含 base 自身),防止 ../ 穿越。
func ensureInside(base, target string) error {
	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return fmt.Errorf("file: abs base %q: %w", base, err)
	}
	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return fmt.Errorf("file: abs target %q: %w", target, err)
	}
	baseAbs = filepath.Clean(baseAbs)
	targetAbs = filepath.Clean(targetAbs)

	if targetAbs == baseAbs {
		return nil
	}
	rel, err := filepath.Rel(baseAbs, targetAbs)
	if err != nil {
		return fmt.Errorf("file: path %q escapes workspace %q: %w", targetAbs, baseAbs, err)
	}
	if rel == "." {
		return nil
	}
	if strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return fmt.Errorf("file: path %q escapes workspace %q", targetAbs, baseAbs)
	}
	return nil
}