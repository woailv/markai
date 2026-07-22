package aiproto

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"prompttool/internal/services/file"
)

// ExecStatus 与前端 ExecStatus 字符串枚举保持一致。
type ExecStatus string

const (
	StatusSuccess   ExecStatus = "success"
	StatusError     ExecStatus = "error"
	StatusCancelled ExecStatus = "cancelled"
	StatusSkipped   ExecStatus = "skipped"
)

// ExecResult 单条指令的执行回执,直接落到消息 sentinel 里给前端渲染。
type ExecResult struct {
	Kind       CommandKind `json:"kind"`
	Status     ExecStatus  `json:"status"`
	Summary    string      `json:"summary,omitempty"`
	Detail     string      `json:"detail,omitempty"`
	Path       string      `json:"path,omitempty"`
	DurationMs int64       `json:"durationMs"`
}

// ExecutionReport 一次批次执行的完整结果。
type ExecutionReport struct {
	Results []ExecResult `json:"results"`
	Aborted bool         `json:"aborted"`
	BatchID uint64       `json:"batchId,omitempty"`
}

// FileOps 执行器需要的文件系统能力子集。用接口抽象,便于测试与解耦。
// 现有 file.FileService 天然满足该接口。
type FileOps interface {
	Read(path string) (*file.ReadFileResult, error)
	Write(in file.WriteFileInput) (*file.WriteFileResult, error)
	Move(in file.MovePathInput) error
	DeleteWithBatch(in file.DeleteInput) error
	CreateDirectoryWithBatch(in file.CreateDirectoryInput) error
	List(path string) ([]file.FileEntry, error)
}

// Executor 顺序执行 ParseItem 列表并输出 ExecutionReport。
type Executor struct {
	files FileOps
}

// NewExecutor 构造一个 Executor。files 不可为 nil。
func NewExecutor(files FileOps) *Executor {
	return &Executor{files: files}
}

// Execute 顺序执行,任一 error 状态即中断后续项目(标记为 skipped)。
// 语义与前端 executeCommands 相同,但不再弹确认对话(WRITE_FILE 覆盖 / DELETE_FILE
// 直接放行,回滚交给快照批次)。
func (e *Executor) Execute(items []ParseItem, batchID uint64) ExecutionReport {
	results := make([]ExecResult, 0, len(items))
	aborted := false

	for _, item := range items {
		if aborted {
			results = append(results, ExecResult{
				Kind:    item.Kind(),
				Status:  StatusSkipped,
				Summary: "已跳过(前序指令失败)",
				Path:    pathOf(item),
			})
			continue
		}
		if item.IsParseError() {
			results = append(results, ExecResult{
				Kind:    KindParseError,
				Status:  StatusError,
				Summary: "解析失败",
				Detail:  item.Message,
			})
			aborted = true
			continue
		}
		start := time.Now()
		r := e.runOne(item.Command, batchID)
		r.DurationMs = time.Since(start).Milliseconds()
		results = append(results, r)
		if r.Status == StatusError {
			aborted = true
		}
	}
	return ExecutionReport{Results: results, Aborted: aborted, BatchID: batchID}
}

func (e *Executor) runOne(cmd *Command, batchID uint64) ExecResult {
	switch cmd.Kind {
	case KindWriteFile:
		return e.runWrite(cmd, batchID)
	case KindEditFile:
		return e.runEdit(cmd, batchID)
	case KindDeleteFile:
		return e.runDelete(cmd, batchID)
	case KindMovePath:
		return e.runMove(cmd, batchID)
	case KindCreateDirectory:
		return e.runCreateDir(cmd, batchID)
	case KindRequestDirectoryList:
		return e.runListDir(cmd)
	case KindRequestFile:
		return e.runReadFile(cmd)
	default:
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "未知指令",
			Detail:  fmt.Sprintf("unhandled kind: %s", cmd.Kind),
			Path:    cmd.Path,
		}
	}
}

func (e *Executor) runWrite(cmd *Command, batchID uint64) ExecResult {
	res, err := e.files.Write(file.WriteFileInput{
		Path:    cmd.Path,
		Content: cmd.Content,
		BatchID: batchID,
	})
	if err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "写入失败",
			Detail:  err.Error(),
			Path:    cmd.Path,
		}
	}
	summary := "写入(覆盖)"
	if res != nil && res.Created {
		summary = "新建文件"
	}
	var detail string
	if res != nil {
		detail = res.Diff
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: summary,
		Detail:  detail,
		Path:    cmd.Path,
	}
}

func (e *Executor) runEdit(cmd *Command, batchID uint64) ExecResult {
	read, err := e.files.Read(cmd.Path)
	if err != nil || read == nil {
		msg := "无法读取文件内容"
		if err != nil {
			msg = err.Error()
		}
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "读取失败",
			Detail:  msg,
			Path:    cmd.Path,
		}
	}
	originalUsesCRLF := strings.Contains(read.Content, "\r\n")
	applied, failedAt, reason := applyEdits(read.Content, cmd.Edits)
	if reason != "" {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: fmt.Sprintf("编辑失败(第 %d 块)", failedAt+1),
			Detail:  reason,
			Path:    cmd.Path,
		}
	}
	finalContent := applied
	if originalUsesCRLF {
		finalContent = normalizeToCRLF(applied)
	}
	write, err := e.files.Write(file.WriteFileInput{
		Path:    cmd.Path,
		Content: finalContent,
		BatchID: batchID,
	})
	if err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "写入失败",
			Detail:  err.Error(),
			Path:    cmd.Path,
		}
	}
	var diff string
	if write != nil {
		diff = write.Diff
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: fmt.Sprintf("应用 %d 处编辑", len(cmd.Edits)),
		Detail:  diff,
		Path:    cmd.Path,
	}
}

func (e *Executor) runDelete(cmd *Command, batchID uint64) ExecResult {
	if err := e.files.DeleteWithBatch(file.DeleteInput{Path: cmd.Path, BatchID: batchID}); err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "删除失败",
			Detail:  err.Error(),
			Path:    cmd.Path,
		}
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: "已删除",
		Path:    cmd.Path,
	}
}

func (e *Executor) runMove(cmd *Command, batchID uint64) ExecResult {
	if err := e.files.Move(file.MovePathInput{
		Source:      cmd.Source,
		Destination: cmd.Destination,
		BatchID:     batchID,
	}); err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "移动失败",
			Detail:  err.Error(),
			Path:    cmd.Destination,
		}
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: "已移动",
		Path:    fmt.Sprintf("%s → %s", cmd.Source, cmd.Destination),
	}
}

func (e *Executor) runCreateDir(cmd *Command, batchID uint64) ExecResult {
	if err := e.files.CreateDirectoryWithBatch(file.CreateDirectoryInput{
		Path:    cmd.Path,
		BatchID: batchID,
	}); err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "建目录失败",
			Detail:  err.Error(),
			Path:    cmd.Path,
		}
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: "已创建目录",
		Path:    cmd.Path,
	}
}

func (e *Executor) runListDir(cmd *Command) ExecResult {
	entries, err := e.files.List(cmd.Path)
	if err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "列目录失败",
			Detail:  err.Error(),
			Path:    cmd.Path,
		}
	}
	lines := make([]string, 0, len(entries))
	for _, entry := range entries {
		prefix := "-"
		if entry.IsDir {
			prefix = "d"
		}
		lines = append(lines, fmt.Sprintf("%s %s", prefix, entry.Name))
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: fmt.Sprintf("列出 %d 项", len(lines)),
		Detail:  strings.Join(lines, "\n"),
		Path:    cmd.Path,
	}
}

func (e *Executor) runReadFile(cmd *Command) ExecResult {
	res, err := e.files.Read(cmd.Path)
	if err != nil {
		return ExecResult{
			Kind:    cmd.Kind,
			Status:  StatusError,
			Summary: "读取失败",
			Detail:  err.Error(),
			Path:    cmd.Path,
		}
	}
	var (
		size    int64
		content string
	)
	if res != nil {
		size = res.Size
		content = res.Content
	}
	return ExecResult{
		Kind:    cmd.Kind,
		Status:  StatusSuccess,
		Summary: fmt.Sprintf("读取 %d 字节", size),
		Detail:  content,
		Path:    cmd.Path,
	}
}

func pathOf(item ParseItem) string {
	if item.Command == nil {
		return ""
	}
	if item.Command.Kind == KindMovePath {
		return item.Command.Destination
	}
	return item.Command.Path
}

// ---------- SEARCH/REPLACE 应用 ----------

func applyEdits(original string, edits []SearchReplaceBlock) (result string, failedAt int, reason string) {
	content := normalizeNewlines(original)
	for i, e := range edits {
		search := normalizeNewlines(e.Search)
		replace := normalizeNewlines(e.Replace)

		if search == "" {
			sep := ""
			if content != "" && !strings.HasSuffix(content, "\n") {
				sep = "\n"
			}
			content = content + sep + replace
			continue
		}

		first := strings.Index(content, search)
		if first != -1 {
			second := strings.Index(content[first+len(search):], search)
			if second != -1 {
				return "", i, "SEARCH 块在文件中出现多次,请补充上下文以保证唯一性\n\n" + renderSearchSnippet(search)
			}
			content = content[:first] + replace + content[first+len(search):]
			continue
		}

		// 兜底:忽略行尾空白后再试一次
		if start, end, found := findLenient(content, search); found {
			content = content[:start] + replace + content[end:]
			continue
		}

		return "", i, "SEARCH 块未在文件中找到精确匹配。可能原因:缩进/空白差异、行尾空白、内容漂移。\n\n" + renderSearchSnippet(search)
	}
	return content, 0, ""
}

var crlfRE = regexp.MustCompile(`\r?\n`)

func normalizeToCRLF(s string) string {
	return crlfRE.ReplaceAllString(s, "\r\n")
}

func normalizeNewlines(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return s
}

func findLenient(haystack, needle string) (start, end int, ok bool) {
	hayLines := strings.Split(haystack, "\n")
	needleLines := strings.Split(needle, "\n")
	if len(needleLines) == 0 {
		return 0, 0, false
	}
	rtrim := func(s string) string { return strings.TrimRight(s, " \t") }
	nTrim := make([]string, len(needleLines))
	for i, l := range needleLines {
		nTrim[i] = rtrim(l)
	}
	matchedAt := -1
	for i := 0; i+len(needleLines) <= len(hayLines); i++ {
		match := true
		for j := 0; j < len(needleLines); j++ {
			if rtrim(hayLines[i+j]) != nTrim[j] {
				match = false
				break
			}
		}
		if match {
			if matchedAt != -1 {
				return 0, 0, false // 多处命中,拒绝
			}
			matchedAt = i
		}
	}
	if matchedAt == -1 {
		return 0, 0, false
	}
	start = 0
	for k := 0; k < matchedAt; k++ {
		start += len(hayLines[k]) + 1
	}
	end = start
	for k := 0; k < len(needleLines); k++ {
		end += len(hayLines[matchedAt+k])
		if k < len(needleLines)-1 {
			end += 1
		}
	}
	return start, end, true
}

func renderSearchSnippet(search string) string {
	lines := strings.Split(search, "\n")
	take := lines
	suffix := ""
	if len(lines) > 6 {
		take = lines[:6]
		suffix = "\n…(已截断)"
	}
	prefixed := make([]string, 0, len(take))
	for _, l := range take {
		prefixed = append(prefixed, "> "+l)
	}
	return "SEARCH 首几行:\n" + strings.Join(prefixed, "\n") + suffix
}
