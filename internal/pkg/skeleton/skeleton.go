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
