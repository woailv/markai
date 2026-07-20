package pathutil

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

// RequireAbs 校验路径非空且为绝对路径,并返回 Clean 后的形式。
// 用于所有 Service 层对外部传入路径的统一校验。
func RequireAbs(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", errors.New("path required")
	}
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("path must be absolute: %q", p)
	}
	return filepath.Clean(p), nil
}
