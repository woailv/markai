// Package skeleton 提供代码骨架提取服务,将 pkg/skeleton 的能力暴露给前端。
package skeleton

import (
	"fmt"

	pkgskeleton "prompttool/internal/pkg/skeleton"
)

// SkeletonService 暴露给前端:根据文件或目录路径批量提取代码骨架。
type SkeletonService struct{}

// NewSkeletonService 构造 SkeletonService。
func NewSkeletonService() *SkeletonService {
	return &SkeletonService{}
}

// ExtractItem 是骨架提取的单个文件结果。
// Supported 为 false 时表示该文件扩展名尚未支持,此时 Skeleton 为空。
// Error 非空时表示该文件在读取 / 解析阶段发生错误(不会中断其他文件)。
type ExtractItem struct {
	Path      string `json:"path"`
	Skeleton  string `json:"skeleton"`
	Supported bool   `json:"supported"`
	Error     string `json:"error,omitempty"`
}

// ExtractResult 是骨架提取的批量返回结构。
type ExtractResult struct {
	Items []ExtractItem `json:"items"`
}

// Extract 接收一组路径(文件或目录),对每个可提取的源码文件返回骨架文本。
// 目录会被递归遍历,自动跳过不受支持的扩展名。
func (s *SkeletonService) Extract(paths []string) (*ExtractResult, error) {
	if len(paths) == 0 {
		return nil, fmt.Errorf("skeleton service: empty paths")
	}
	fileResults, err := pkgskeleton.ExtractPaths(paths)
	if err != nil {
		return nil, err
	}
	items := make([]ExtractItem, 0, len(fileResults))
	for _, r := range fileResults {
		item := ExtractItem{
			Path:      r.Path,
			Skeleton:  r.Skeleton,
			Supported: r.Supported,
		}
		if r.Err != nil {
			item.Error = r.Err.Error()
		}
		items = append(items, item)
	}
	return &ExtractResult{Items: items}, nil
}