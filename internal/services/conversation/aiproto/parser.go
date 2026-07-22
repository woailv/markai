// Package aiproto 定义 AI 消息里的文件编辑协议的解析与执行。
//
// 与前端(旧)parser.ts 语义等价:识别 XML 风格的文件操作标签,
// 支持 WRITE_FILE / EDIT_FILE / DELETE_FILE / MOVE_PATH /
// CREATE_DIRECTORY / REQUEST_DIRECTORY_LIST / REQUEST_FILE。
package aiproto

import (
	"fmt"
	"regexp"
	"strings"
)

// CommandKind 指令种类。
type CommandKind string

const (
	KindWriteFile             CommandKind = "WRITE_FILE"
	KindEditFile              CommandKind = "EDIT_FILE"
	KindDeleteFile            CommandKind = "DELETE_FILE"
	KindMovePath              CommandKind = "MOVE_PATH"
	KindCreateDirectory       CommandKind = "CREATE_DIRECTORY"
	KindRequestDirectoryList  CommandKind = "REQUEST_DIRECTORY_LIST"
	KindRequestFile           CommandKind = "REQUEST_FILE"
	KindParseError            CommandKind = "PARSE_ERROR"
)

// AllCommandTags 是所有已支持的指令标签,与正则的 alternation 顺序相同。
var AllCommandTags = []CommandKind{
	KindWriteFile,
	KindEditFile,
	KindDeleteFile,
	KindMovePath,
	KindCreateDirectory,
	KindRequestDirectoryList,
	KindRequestFile,
}

// SearchReplaceBlock EDIT_FILE 中的一对 SEARCH/REPLACE。
type SearchReplaceBlock struct {
	Search  string `json:"search"`
	Replace string `json:"replace"`
}

// Command 单条已解析指令。属性按 kind 取用,与前端 ParsedCommand 保持一致。
type Command struct {
	Kind        CommandKind          `json:"kind"`
	Path        string               `json:"path,omitempty"`
	Content     string               `json:"content,omitempty"`
	Edits       []SearchReplaceBlock `json:"edits,omitempty"`
	Source      string               `json:"source,omitempty"`      // MOVE_PATH source_path
	Destination string               `json:"destination,omitempty"` // MOVE_PATH destination_path
}

// ParseItem 解析结果的统一条目:成功指令或解析错误。
type ParseItem struct {
	Command *Command `json:"command,omitempty"`

	// ParseError 字段:
	Raw     string `json:"raw,omitempty"`     // 未能解析的原始标签片段
	Message string `json:"message,omitempty"` // 错误信息
}

// IsParseError 判断该条目是否为解析错误。
func (p ParseItem) IsParseError() bool { return p.Command == nil }

// Kind 返回条目的 kind:成功指令返回其 kind,解析错误返回 PARSE_ERROR。
func (p ParseItem) Kind() CommandKind {
	if p.Command != nil {
		return p.Command.Kind
	}
	return KindParseError
}

// ParseItemWithRange 带原文字节区间的解析结果,用于严格内联切片渲染。
type ParseItemWithRange struct {
	Item  ParseItem `json:"item"`
	Start int       `json:"start"`
	End   int       `json:"end"`
}

var tagAlternation = func() string {
	names := make([]string, 0, len(AllCommandTags))
	for _, t := range AllCommandTags {
		names = append(names, string(t))
	}
	return strings.Join(names, "|")
}()

// DetectRegexp 用于快速判断一段文本里是否包含指令标签头。
// 供后端在 AppendMessage 时判断消息 role。
var DetectRegexp = regexp.MustCompile(`<(?:` + tagAlternation + `)(?:[\s/>])`)

// HasCommandTag 与 DetectRegexp.MatchString 语义一致,便于阅读。
func HasCommandTag(s string) bool { return DetectRegexp.MatchString(s) }

// 命令块整体匹配:自闭合 `<TAG .../>` 或成对 `<TAG ...>body</TAG>`。
// 使用非贪婪匹配捕获属性区与正文。Go 的 regexp 不支持反向引用,
// 因此这里用两次匹配:先匹配可能的标签头,再手工找 </TAG> 收尾。
var commandTagOpenRE = regexp.MustCompile(
	`<(` + tagAlternation + `)\b([^>]*?)(/?)>`,
)

// AttrRegexp 提取属性 name="value" | name='value'。
var attrRegexp = regexp.MustCompile(`(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'`)

// codeFenceRegexp 提取 ```lang\n...\n``` 里的正文。
var codeFenceRegexp = regexp.MustCompile("(?m)```[^\\n]*\\n([\\s\\S]*?)\\n```")

// searchReplaceRegexp 匹配一个 SEARCH/REPLACE 块。前端 parser 也用相同结构:
//
//	<<<<<<< SEARCH
//	...
//	=======
//	...
//	>>>>>>> REPLACE
var searchReplaceRegexp = regexp.MustCompile(
	`<{7}[ \t]*SEARCH[ \t]*\n([\s\S]*?)\n={7}[ \t]*\n([\s\S]*?)\n?>{7}[ \t]*REPLACE`,
)

// ParseCommands 从文本里解析所有指令,按出现顺序返回。
func ParseCommands(text string) []ParseItem {
	items := ParseCommandsWithRanges(text)
	out := make([]ParseItem, 0, len(items))
	for _, it := range items {
		out = append(out, it.Item)
	}
	return out
}

// ParseCommandsWithRanges 与 ParseCommands 相同,但额外返回每条命令在原文中的字节区间。
func ParseCommandsWithRanges(text string) []ParseItemWithRange {
	out := make([]ParseItemWithRange, 0)
	pos := 0
	for pos < len(text) {
		loc := commandTagOpenRE.FindStringSubmatchIndex(text[pos:])
		if loc == nil {
			break
		}
		absStart := pos + loc[0]
		absHeadEnd := pos + loc[1]

		tag := CommandKind(text[pos+loc[2] : pos+loc[3]])
		attrRaw := text[pos+loc[4] : pos+loc[5]]
		selfClosing := loc[6] >= 0 && text[pos+loc[6]:pos+loc[7]] == "/"

		var (
			inner  string
			absEnd int
		)
		if selfClosing {
			absEnd = absHeadEnd
		} else {
			closeToken := "</" + string(tag)
			rel := strings.Index(text[absHeadEnd:], closeToken)
			if rel < 0 {
				// 未闭合的标签整体报错,并跳过标签头。
				out = append(out, ParseItemWithRange{
					Item: ParseItem{
						Raw:     text[absStart:absHeadEnd],
						Message: fmt.Sprintf("<%s> 未闭合", tag),
					},
					Start: absStart,
					End:   absHeadEnd,
				})
				pos = absHeadEnd
				continue
			}
			innerEnd := absHeadEnd + rel
			inner = text[absHeadEnd:innerEnd]
			// 找到 `>` 使 </TAG ...> 结束
			gtRel := strings.Index(text[innerEnd:], ">")
			if gtRel < 0 {
				out = append(out, ParseItemWithRange{
					Item: ParseItem{
						Raw:     text[absStart:innerEnd],
						Message: fmt.Sprintf("<%s> 未闭合", tag),
					},
					Start: absStart,
					End:   innerEnd,
				})
				pos = innerEnd
				continue
			}
			absEnd = innerEnd + gtRel + 1
		}

		attrs := parseAttrs(attrRaw)
		item := buildItem(tag, attrs, inner)
		out = append(out, ParseItemWithRange{
			Item:  item,
			Start: absStart,
			End:   absEnd,
		})
		pos = absEnd
	}
	return out
}

func buildItem(kind CommandKind, attrs map[string]string, inner string) ParseItem {
	switch kind {
	case KindWriteFile:
		path, err := requireAttr(attrs, "path", kind)
		if err != nil {
			return parseErr(kind, err.Error())
		}
		content := extractCodeFence(inner)
		return ok(&Command{Kind: kind, Path: path, Content: content})
	case KindEditFile:
		path, err := requireAttr(attrs, "path", kind)
		if err != nil {
			return parseErr(kind, err.Error())
		}
		edits := parseSearchReplaceBlocks(inner)
		if len(edits) == 0 {
			return parseErr(kind, "EDIT_FILE 未包含任何 SEARCH/REPLACE 块")
		}
		return ok(&Command{Kind: kind, Path: path, Edits: edits})
	case KindDeleteFile, KindCreateDirectory, KindRequestDirectoryList, KindRequestFile:
		path, err := requireAttr(attrs, "path", kind)
		if err != nil {
			return parseErr(kind, err.Error())
		}
		return ok(&Command{Kind: kind, Path: path})
	case KindMovePath:
		src, err := requireAttr(attrs, "source_path", kind)
		if err != nil {
			return parseErr(kind, err.Error())
		}
		dst, err := requireAttr(attrs, "destination_path", kind)
		if err != nil {
			return parseErr(kind, err.Error())
		}
		return ok(&Command{Kind: kind, Source: src, Destination: dst})
	default:
		return parseErr(kind, "未知指令: "+string(kind))
	}
}

func ok(c *Command) ParseItem { return ParseItem{Command: c} }
func parseErr(kind CommandKind, msg string) ParseItem {
	return ParseItem{Raw: string(kind), Message: msg}
}

func requireAttr(attrs map[string]string, key string, tag CommandKind) (string, error) {
	v := strings.TrimSpace(attrs[key])
	if v == "" {
		return "", fmt.Errorf("<%s> 缺少必需属性 %s", tag, key)
	}
	return v, nil
}

func parseAttrs(raw string) map[string]string {
	out := map[string]string{}
	for _, m := range attrRegexp.FindAllStringSubmatch(raw, -1) {
		key := m[1]
		val := m[2]
		if key == "" {
			key = m[3]
			val = m[4]
		}
		if key != "" {
			out[key] = val
		}
	}
	return out
}

func extractCodeFence(body string) string {
	if m := codeFenceRegexp.FindStringSubmatch(body); m != nil {
		return m[1]
	}
	return strings.Trim(body, "\n")
}

func parseSearchReplaceBlocks(body string) []SearchReplaceBlock {
	normalized := strings.ReplaceAll(body, "\r\n", "\n")
	matches := searchReplaceRegexp.FindAllStringSubmatch(normalized, -1)
	if len(matches) == 0 {
		return nil
	}
	out := make([]SearchReplaceBlock, 0, len(matches))
	for _, m := range matches {
		out = append(out, SearchReplaceBlock{Search: m[1], Replace: m[2]})
	}
	return out
}
