//go:build windows

package services

import (
	"os"

	"golang.org/x/sys/windows"
)

// clearReadOnly 清除文件的只读属性(Windows)。文件不存在时返回 nil。
func clearReadOnly(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if info.IsDir() {
		return nil
	}
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	attrs, err := windows.GetFileAttributes(p)
	if err != nil {
		return err
	}
	if attrs&windows.FILE_ATTRIBUTE_READONLY == 0 {
		return nil
	}
	return windows.SetFileAttributes(p, attrs&^windows.FILE_ATTRIBUTE_READONLY)
}