//go:build !windows

package services

// clearReadOnly 非 Windows 平台无需处理。POSIX 权限通过 chmod 处理,
// 此处保持空实现以维持接口一致。
func clearReadOnly(path string) error {
	return nil
}

// isHiddenPath 判断路径是否为隐藏项(POSIX)。以 '.' 开头即视为隐藏。
func isHiddenPath(_ string, name string) bool {
	return len(name) > 0 && name[0] == '.'
}