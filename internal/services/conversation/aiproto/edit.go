package aiproto

import (
	"regexp"
	"strings"
)

// ApplyEdits 顺序应用 SEARCH/REPLACE 块到 original,并返回结果:
//
//	ok=true:  content 为改写后的整段内容
//	ok=false: reason 说明失败原因; failedAt 是 0 起的失败块序号
//
// 规则(与旧前端 execute.ts 保持一致):
//   - 匹配前把 haystack 和 needle 统一归一为 LF;
//   - 空 SEARCH = 追加(在末尾,保证前后至少一个换行);
//   - SEARCH 需在归一后文本中出现且仅出现一次;
//   - 精确匹配失败时,自动尝试忽略每行行尾空白的宽松匹配作为兜底;
//   - 多次命中或未命中均视为失败,并给出可诊断信息。
//
// 该函数只处理换行归一后的字符串;调用方决定是否恢复原文的 CRLF 风格,
// 可结合 NormalizeToCRLF 使用。
func ApplyEdits(original string, edits []SearchReplaceBlock) (result string, ok bool, failedAt int, reason string) {
	content := NormalizeNewlines(original)
	for i, e := range edits {
		search := NormalizeNewlines(e.Search)
		replace := NormalizeNewlines(e.Replace)

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
				return "", false, i,
					"SEARCH 块在文件中出现多次,请补充上下文以保证唯一性\n\n" + renderSearchSnippet(search)
			}
			content = content[:first] + replace + content[first+len(search):]
			continue
		}

		if start, end, found := findLenient(content, search); found {
			content = content[:start] + replace + content[end:]
			continue
		}

		return "", false, i,
			"SEARCH 块未在文件中找到精确匹配。可能原因:缩进/空白差异、行尾空白、内容漂移。\n\n" + renderSearchSnippet(search)
	}
	return content, true, 0, ""
}

var crlfRE = regexp.MustCompile(`\r?\n`)

// NormalizeToCRLF 把任意换行统一改为 \r\n。
func NormalizeToCRLF(s string) string { return crlfRE.ReplaceAllString(s, "\r\n") }

// NormalizeNewlines 把 CRLF / CR 统一改为 LF。
func NormalizeNewlines(s string) string {
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
				return 0, 0, false
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
