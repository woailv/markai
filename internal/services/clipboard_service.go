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

// ClipboardPaths 表示从系统剪贴板读取到的文件路径集合及其操作语义。
// Cut=true 表示系统剪贴板标记为"剪切"(Windows 下 Preferred DropEffect=2),
// 粘贴方应在复制成功后删除源文件。
type ClipboardPaths struct {
	Paths []string `json:"paths"`
	Cut   bool     `json:"cut"`
}

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

// ReadPaths 从系统剪贴板读取文件路径列表。
// 若剪贴板不含文件引用,返回空 Paths 和 nil 错误(调用方据此决定是否降级为文本粘贴)。
// Cut 字段在支持的平台上反映"剪切"语义(目前 Windows 下通过 Preferred DropEffect 判定)。
func (s *ClipboardService) ReadPaths() (*ClipboardPaths, error) {
	switch runtime.GOOS {
	case "windows":
		return readClipboardWindows()
	case "darwin":
		return readClipboardDarwin()
	default:
		return readClipboardLinux()
	}
}

// readClipboardWindows 通过 PowerShell 读取 CF_HDROP 文件列表,并解析 Preferred DropEffect
// 判断是否为剪切语义(值 & 0x2 != 0 视为剪切)。
func readClipboardWindows() (*ClipboardPaths, error) {
	// 使用极不可能出现在路径中的分隔符 US(\u001F)分割文件列表,
	// 与 DropEffect 之间使用 RS(\u001E)分隔,便于稳定解析。
	script := `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
$effect = 5
$data = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($data -ne $null -and $data.GetDataPresent('Preferred DropEffect')) {
    $stream = $data.GetData('Preferred DropEffect')
    if ($stream -ne $null) {
        $buf = New-Object byte[] 4
        [void]$stream.Read($buf, 0, 4)
        $effect = [BitConverter]::ToInt32($buf, 0)
    }
}
$joined = ''
if ($files -ne $null -and $files.Count -gt 0) {
    $joined = [string]::Join([char]0x1F, @($files))
}
[Console]::Out.Write($joined + [char]0x1E + $effect)
`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-STA", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("clipboard: powershell read: %w: %s", err, stderr.String())
	}

	out := stdout.String()
	sepIdx := strings.LastIndex(out, "\x1E")
	if sepIdx < 0 {
		return &ClipboardPaths{}, nil
	}
	rawPaths := out[:sepIdx]
	effectStr := strings.TrimSpace(out[sepIdx+1:])

	paths := make([]string, 0)
	if rawPaths != "" {
		for _, p := range strings.Split(rawPaths, "\x1F") {
			p = strings.TrimSpace(p)
			if p != "" {
				paths = append(paths, p)
			}
		}
	}

	cut := false
	// DropEffect: 0x1=Copy, 0x2=Move。移动位存在即视为剪切。
	if v, err := parseIntSafe(effectStr); err == nil {
		if v&0x2 != 0 && v&0x1 == 0 {
			cut = true
		}
	}
	return &ClipboardPaths{Paths: paths, Cut: cut}, nil
}

// readClipboardDarwin 通过 osascript 读取剪贴板中的文件引用。
// macOS 没有类似 Windows 的 Preferred DropEffect,统一按"复制"语义返回。
func readClipboardDarwin() (*ClipboardPaths, error) {
	// 尝试以文件列表形式获取;若剪贴板不含文件,osascript 会报错,此时返回空。
	script := `
try
    set theFiles to the clipboard as «class furl»
    return POSIX path of theFiles
on error
    try
        set theList to the clipboard as list
        set out to ""
        repeat with f in theList
            try
                set out to out & (POSIX path of f) & (ASCII character 31)
            end try
        end repeat
        return out
    on error
        return ""
    end try
end try
`
	cmd := exec.Command("osascript", "-e", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		// osascript 在剪贴板无文件时可能报错,视为空剪贴板。
		return &ClipboardPaths{}, nil
	}
	out := strings.TrimRight(stdout.String(), "\r\n")
	if out == "" {
		return &ClipboardPaths{}, nil
	}
	paths := make([]string, 0)
	for _, p := range strings.Split(out, "\x1F") {
		p = strings.TrimSpace(p)
		if p != "" {
			paths = append(paths, p)
		}
	}
	if len(paths) == 0 && out != "" {
		paths = append(paths, strings.TrimSpace(out))
	}
	return &ClipboardPaths{Paths: paths, Cut: false}, nil
}

// readClipboardLinux 优先 wl-paste(Wayland),回退 xclip(X11),读取 text/uri-list。
// Linux 桌面剪切语义(x-special/gnome-copied-files)未覆盖,统一按复制处理。
func readClipboardLinux() (*ClipboardPaths, error) {
	var cmd *exec.Cmd
	switch {
	case commandExists("wl-paste"):
		cmd = exec.Command("wl-paste", "--type", "text/uri-list")
	case commandExists("xclip"):
		cmd = exec.Command("xclip", "-selection", "clipboard", "-t", "text/uri-list", "-o")
	default:
		return nil, errors.New("clipboard: neither wl-paste nor xclip is available")
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		// 无 uri-list 数据视为空剪贴板,而非硬错误。
		return &ClipboardPaths{}, nil
	}
	paths := make([]string, 0)
	for _, line := range strings.Split(stdout.String(), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "file://") {
			paths = append(paths, decodeFileURI(strings.TrimPrefix(line, "file://")))
		}
	}
	return &ClipboardPaths{Paths: paths, Cut: false}, nil
}

// decodeFileURI 对 file:// URI 的路径部分做 URL 反转义(处理空格 %20 等)。
func decodeFileURI(p string) string {
	var b strings.Builder
	for i := 0; i < len(p); i++ {
		if p[i] == '%' && i+2 < len(p) {
			h1, ok1 := hexVal(p[i+1])
			h2, ok2 := hexVal(p[i+2])
			if ok1 && ok2 {
				b.WriteByte(byte(h1<<4 | h2))
				i += 2
				continue
			}
		}
		b.WriteByte(p[i])
	}
	return b.String()
}

func hexVal(c byte) (int, bool) {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0'), true
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10, true
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10, true
	}
	return 0, false
}

// parseIntSafe 解析十进制整数,失败返回错误。避免引入 strconv 造成大范围修改。
func parseIntSafe(s string) (int, error) {
	if s == "" {
		return 0, errors.New("empty")
	}
	sign := 1
	i := 0
	if s[0] == '-' {
		sign = -1
		i = 1
	} else if s[0] == '+' {
		i = 1
	}
	if i >= len(s) {
		return 0, errors.New("no digits")
	}
	n := 0
	for ; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid char %q", c)
		}
		n = n*10 + int(c-'0')
	}
	return sign * n, nil
}