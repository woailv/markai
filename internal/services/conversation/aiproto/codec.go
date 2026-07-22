package aiproto

import (
	"encoding/json"
	"regexp"
	"strings"
)

// ExecMeta 是尾部 sentinel 承载的结构。相比旧版,segments 把"文本/命令"切片
// 直接下沉到后端产出,前端不再需要重新解析原文。
type ExecMeta struct {
	Status        string       `json:"status"` // "pending" | "done"
	BatchID       uint64       `json:"batchId,omitempty"`
	TotalCommands int          `json:"totalCommands"`
	Segments      []MetaSegment `json:"segments"`
}

// MetaSegment 描述一段文本或一条命令(附执行结果)。
type MetaSegment struct {
	Type    string      `json:"type"` // "text" | "cmd" | "parseError"
	Value   string      `json:"value,omitempty"`
	Command *Command    `json:"command,omitempty"`
	Result  *ExecResult `json:"result,omitempty"`
	Raw     string      `json:"raw,omitempty"`
	Message string      `json:"message,omitempty"`
}

const (
	metaOpen  = "<!--__EXEC_META__"
	metaClose = "-->"
)

// metaRE 匹配尾部 sentinel(含前置换行)。
var metaRE = regexp.MustCompile(`(?s)\n*<!--__EXEC_META__\n(.*?)\n-->\s*$`)

// EncodeExecMeta 序列化 sentinel。返回追加到正文末尾的整段字符串(含前置空行)。
func EncodeExecMeta(meta ExecMeta) string {
	b, _ := json.Marshal(meta)
	var sb strings.Builder
	sb.WriteString("\n\n")
	sb.WriteString(metaOpen)
	sb.WriteByte('\n')
	sb.Write(b)
	sb.WriteByte('\n')
	sb.WriteString(metaClose)
	return sb.String()
}

// DecodeExecMeta 从正文末尾抽取 sentinel。未命中返回 nil。
func DecodeExecMeta(content string) *ExecMeta {
	m := metaRE.FindStringSubmatch(content)
	if m == nil {
		return nil
	}
	var out ExecMeta
	if err := json.Unmarshal([]byte(m[1]), &out); err != nil {
		return nil
	}
	if out.Status != "pending" && out.Status != "done" {
		return nil
	}
	return &out
}

// StripExecMeta 剥离末尾 sentinel,返回纯正文。
func StripExecMeta(content string) string {
	return metaRE.ReplaceAllString(content, "")
}

// WithExecMeta 覆盖或追加 sentinel,始终基于剥离过的正文。
func WithExecMeta(content string, meta ExecMeta) string {
	clean := StripExecMeta(content)
	return clean + EncodeExecMeta(meta)
}

// BuildSegments 根据原文 + 解析结果 + (可选) 执行报告,输出 sentinel 里的 segments。
// 当 report 为 nil 时,所有 cmd 段无 result(pending)。
func BuildSegments(text string, ranges []ParseItemWithRange, report *ExecutionReport) []MetaSegment {
	if len(ranges) == 0 {
		return nil
	}
	segments := make([]MetaSegment, 0, len(ranges)*2+1)
	cursor := 0
	for i, r := range ranges {
		if r.Start > cursor {
			chunk := text[cursor:r.Start]
			if strings.TrimSpace(chunk) != "" {
				segments = append(segments, MetaSegment{Type: "text", Value: chunk})
			}
		}
		var result *ExecResult
		if report != nil && i < len(report.Results) {
			r := report.Results[i]
			result = &r
		}
		if r.Item.IsParseError() {
			segments = append(segments, MetaSegment{
				Type:    "parseError",
				Raw:     r.Item.Raw,
				Message: r.Item.Message,
				Result:  result,
			})
		} else {
			segments = append(segments, MetaSegment{
				Type:    "cmd",
				Command: r.Item.Command,
				Result:  result,
			})
		}
		cursor = r.End
	}
	if cursor < len(text) {
		tail := text[cursor:]
		if strings.TrimSpace(tail) != "" {
			segments = append(segments, MetaSegment{Type: "text", Value: tail})
		}
	}
	return segments
}
