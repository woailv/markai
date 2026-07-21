// Package skeleton 使用 tree-sitter 从源码文件中提取"代码骨架":
// 保留 package/import 声明、类型定义(含字段)、顶层 const/var 声明,
// 以及函数与方法签名(函数体替换为占位符)。
package skeleton

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrUnsupportedLanguage 表示当前文件扩展名尚未支持。
var ErrUnsupportedLanguage = errors.New("skeleton: unsupported language")

// FileResult 表示单个文件的骨架提取结果。
// Supported 为 false 时,Skeleton 为空;Err 非空时表示读取或解析失败。
type FileResult struct {
	Path      string
	Skeleton  string
	Supported bool
	Err       error
}

// IsSupportedExt 判断扩展名(含点,大小写不敏感)是否受支持。
func IsSupportedExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".go", ".py", ".pyi", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx":
		return true
	}
	return false
}

// ExtractPaths 遍历给定路径集合(文件或目录),对每个受支持的源码文件提取骨架。
// 目录会被递归遍历;不支持的文件被记录为 Supported=false 的条目。
// 遍历过程中出现的任何 IO / 解析错误都体现在对应 FileResult.Err 中,
// 不会中断整体流程。
func ExtractPaths(paths []string) ([]FileResult, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	var results []FileResult
	seen := make(map[string]struct{})

	visitFile := func(p string) {
		abs, err := filepath.Abs(p)
		if err != nil {
			abs = p
		}
		if _, ok := seen[abs]; ok {
			return
		}
		seen[abs] = struct{}{}

		ext := strings.ToLower(filepath.Ext(p))
		if !IsSupportedExt(ext) {
			results = append(results, FileResult{Path: p, Supported: false})
			return
		}
		text, err := Extract(p)
		if err != nil {
			if errors.Is(err, ErrUnsupportedLanguage) {
				results = append(results, FileResult{Path: p, Supported: false})
				return
			}
			results = append(results, FileResult{Path: p, Supported: false, Err: err})
			return
		}
		results = append(results, FileResult{Path: p, Skeleton: text, Supported: true})
	}

	for _, p := range paths {
		if p == "" {
			continue
		}
		info, err := os.Stat(p)
		if err != nil {
			results = append(results, FileResult{Path: p, Err: err})
			continue
		}
		if !info.IsDir() {
			visitFile(p)
			continue
		}
		// 目录:递归遍历
		werr := filepath.WalkDir(p, func(sub string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				// 单节点错误不阻断整体遍历
				return nil
			}
			if d.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(sub))
			if !IsSupportedExt(ext) {
				return nil
			}
			visitFile(sub)
			return nil
		})
		if werr != nil {
			results = append(results, FileResult{Path: p, Err: werr})
		}
	}
	return results, nil
}

// Extract 读取 path 指向的源码文件,按扩展名自动识别语言,返回代码骨架文本。
//
// 支持扩展名:
//   - .go
//   - .py .pyi
//   - .js .mjs .cjs .jsx
//   - .ts
//   - .tsx
//
// 若扩展名未识别,返回 ErrUnsupportedLanguage。
func Extract(path string) (string, error) {
	source, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("skeleton: read %s: %w", path, err)
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".go":
		return extractGo(source)
	case ".py", ".pyi":
		return extractPython(source)
	case ".js", ".mjs", ".cjs", ".jsx":
		return extractJS(source)
	case ".ts":
		return extractTS(source)
	case ".tsx":
		return extractTSX(source)
	default:
		return "", fmt.Errorf("%w: %q", ErrUnsupportedLanguage, ext)
	}
}
