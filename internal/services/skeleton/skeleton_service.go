// Package skeleton 提供代码骨架提取服务,将 pkg/skeleton 的能力暴露给前端。
package skeleton

import (
	"errors"
	"fmt"

	pkgskeleton "prompttool/internal/pkg/skeleton"
)

// SkeletonService 暴露给前端:根据文件路径提取代码骨架。
type SkeletonService struct{}

// NewSkeletonService 构造 SkeletonService。
func NewSkeletonService() *SkeletonService {
	return &SkeletonService{}
}

// ExtractResult 是骨架提取的返回结构。
// Supported 为 false 时表示该扩展名尚未支持,此时 Skeleton 为空。
type ExtractResult struct {
	Path      string `json:"path"`
	Skeleton  string `json:"skeleton"`
	Supported bool   `json:"supported"`
}

// Extract 读取指定路径的源码文件并返回代码骨架文本。
// 若语言不受支持,返回 Supported=false,而非错误,便于前端做降级展示。
func (s *SkeletonService) Extract(path string) (*ExtractResult, error) {
	if path == "" {
		return nil, fmt.Errorf("skeleton service: empty path")
	}
	text, err := pkgskeleton.Extract(path)
	if err != nil {
		if errors.Is(err, pkgskeleton.ErrUnsupportedLanguage) {
			return &ExtractResult{Path: path, Supported: false}, nil
		}
		return nil, err
	}
	return &ExtractResult{Path: path, Skeleton: text, Supported: true}, nil
}
