package services

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// ClipboardService 提供跨平台的文件剪贴板写入能力。
// 前端 Ctrl+C / Ctrl+X 时,除了在内存中(useClipboardStore)记录,
// 还调用本服务把路径写入系统剪贴板,使用户可在系统文件管理器中直接 Ctrl+V 粘贴。
//
// 说明:
// - Windows 使用 PowerShell 的 Set-Clipboard -Path,产生 CF_HDROP 剪贴板格式,
//   Explorer 会识别为"复制文件"操作(粘贴时即复制)。剪切语义受限于系统 API,
//   这里统一按"复制"写入系统剪贴板;内部剪切语义仍由前端 store + 后端删除源实现。
// - macOS 使用 osascript,把路径转换为 POSIX file 引用列表写入通用剪贴板。
// - Linux 优先 wl-copy(Wayland),回退 xclip(X11),写入 text/uri-list MIME。
type ClipboardService struct{}

// NewClipboardService 构造函数。
func NewClipboardService() *ClipboardService {
	return &ClipboardService{}
}

// WritePaths 将给定的绝对路径集合写入系统剪贴板。
// 所有路径必须为绝对路径且必须存在,否则返回错误。
// 空列表视为参数错误。
func (s *ClipboardService) WritePaths(paths []string) error {
	if len(paths) == 0 {
		return errors.New("clipboard: paths required")
	}
	absPaths := make([]string, 0, len(paths))
	for _, p := range paths {
		abs, err := requireAbs(p)
		if err != nil {
			return err
		}
		if _, err := os.Stat(abs); err != nil {
			return fmt.Errorf("clipboard: stat %q: %w", abs, err)
		}
		absPaths = append(absPaths, abs)
	}

	switch runtime.GOOS {
	case "windows":
		return writeClipboardWindows(absPaths)
	case "darwin":
		return writeClipboardDarwin(absPaths)
	default:
		return writeClipboardLinux(absPaths)
	}
}

// writeClipboardWindows 通过 PowerShell 的 Set-Clipboard -Path 写入文件列表。
// 该命令会以 CF_HDROP 格式设置剪贴板,Explorer 粘贴时执行文件复制。
func writeClipboardWindows(paths []string) error {
	quoted := make([]string, 0, len(paths))
	for _, p := range paths {
		// PowerShell 单引号字符串:内部单引号需转义为两个单引号
		escaped := strings.ReplaceAll(p, "'", "''")
		quoted = append(quoted, "'"+escaped+"'")
	}
	script := "Set-Clipboard -Path " + strings.Join(quoted, ",")

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("clipboard: powershell Set-Clipboard: %w: %s", err, stderr.String())
	}
	return nil
}

// writeClipboardDarwin 通过 osascript 把路径转成 POSIX file 引用写入剪贴板。
// 语法示例:set the clipboard to {POSIX file "/a/b", POSIX file "/c/d"}
func writeClipboardDarwin(paths []string) error {
	refs := make([]string, 0, len(paths))
	for _, p := range paths {
		// AppleScript 字符串:反斜杠与双引号需转义
		escaped := strings.ReplaceAll(p, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, `"`, `\"`)
		refs = append(refs, `POSIX file "`+escaped+`"`)
	}
	script := "set the clipboard to {" + strings.Join(refs, ", ") + "}"

	cmd := exec.Command("osascript", "-e", script)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("clipboard: osascript: %w: %s", err, stderr.String())
	}
	return nil
}

// writeClipboardLinux 以 text/uri-list 格式写入剪贴板。
// 优先尝试 wl-copy(Wayland),否则回退 xclip(X11)。
func writeClipboardLinux(paths []string) error {
	uris := make([]string, 0, len(paths))
	for _, p := range paths {
		uris = append(uris, "file://"+p)
	}
	payload := strings.Join(uris, "\r\n")

	var cmd *exec.Cmd
	switch {
	case commandExists("wl-copy"):
		cmd = exec.Command("wl-copy", "--type", "text/uri-list")
	case commandExists("xclip"):
		cmd = exec.Command("xclip", "-selection", "clipboard", "-t", "text/uri-list")
	default:
		return errors.New("clipboard: neither wl-copy nor xclip is available")
	}
	cmd.Stdin = strings.NewReader(payload)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("clipboard: write via %s: %w: %s", cmd.Path, err, stderr.String())
	}
	return nil
}

// commandExists 检查命令是否在 PATH 中可用。
func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}