package skeleton

import (
	"bytes"
	"regexp"
	"strings"
)

var (
	// 顶层 import / export ... from '...'
	jstsImportRe = regexp.MustCompile(`^\s*(?:import\b|export\s+(?:\*|\{|type\s+\{|default\s+)|export\s+\{[^}]*\}\s*from)`)

	// 顶层声明起始:class / interface / type alias / enum / function / const / let / var
	// 允许 export / export default / abstract / async 等前缀
	jstsDeclRe = regexp.MustCompile(`^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|enum|type|function\s*\*?|const|let|var)\b`)

	// 类体内方法/构造器起始行(含 async / static / get / set / 修饰符 / 泛型)
	jstsMethodStartRe = regexp.MustCompile(`^\s*(?:(?:public|private|protected|readonly|static|abstract|override|async)\s+)*[#A-Za-z_$][\w$]*\s*(?:\??\s*)?(?:<[^>]*>\s*)?\(`)
	jstsCtorRe        = regexp.MustCompile(`^\s*(?:(?:public|private|protected)\s+)?constructor\s*\(`)
	jstsGetSetRe      = regexp.MustCompile(`^\s*(?:(?:public|private|protected|static|abstract|override)\s+)*(?:get|set)\s+[A-Za-z_$][\w$]*\s*\(`)
)

// extractJS 通过基于花括号平衡的扫描提取骨架:
// 顶层保留 import/export、class/interface/type/enum/function/const/let/var;
// 类体内保留方法/构造器/getter/setter 的签名(函数体替换为 "{ ... }")。
func extractJS(source []byte) (string, error) {
	return extractJSTS(source)
}

func extractTS(source []byte) (string, error) {
	return extractJSTS(source)
}

func extractTSX(source []byte) (string, error) {
	return extractJSTS(source)
}

func extractJSTS(source []byte) (string, error) {
	lines := splitLines(source)
	var out bytes.Buffer

	i := 0
	for i < len(lines) {
		line := lines[i]
		trimmed := strings.TrimSpace(line)

		if trimmed == "" || strings.HasPrefix(trimmed, "//") {
			i++
			continue
		}

		if !jstsIsTopLevel(line) {
			i++
			continue
		}

		if jstsImportRe.MatchString(line) {
			end := jstsStatementEnd(lines, i)
			for j := i; j < end; j++ {
				out.WriteString(lines[j])
				out.WriteByte('\n')
			}
			i = end
			continue
		}

		if jstsDeclRe.MatchString(line) {
			if isJSTSClassLike(line) {
				end := jstsBlockEnd(lines, i)
				writeJSTSClass(&out, lines, i, end)
				i = end
				continue
			}
			if isJSTSFunctionDecl(line) {
				end := jstsBlockEnd(lines, i)
				writeJSTSFunc(&out, lines, i, end)
				i = end
				continue
			}
			// const/let/var/type alias/enum:原样输出直到语句结束
			end := jstsStatementEnd(lines, i)
			// 如果包含 "{" 则按块结束
			if strings.Contains(strings.Join(lines[i:end], "\n"), "{") &&
				!strings.HasSuffix(strings.TrimSpace(lines[end-1]), ";") &&
				!strings.HasSuffix(strings.TrimSpace(lines[end-1]), "}") {
				end = jstsBlockEnd(lines, i)
			}
			for j := i; j < end; j++ {
				out.WriteString(lines[j])
				out.WriteByte('\n')
			}
			i = end
			continue
		}

		i++
	}
	return out.String(), nil
}

// jstsIsTopLevel 简易顶层判定:该行首字符不是空白即视为顶层。
// (不完全严格,但足以在正则模式下覆盖常见格式化风格。)
func jstsIsTopLevel(line string) bool {
	if line == "" {
		return false
	}
	return line[0] != ' ' && line[0] != '\t'
}

func isJSTSClassLike(line string) bool {
	// class / interface / abstract class
	return regexp.MustCompile(`^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface)\b`).MatchString(line)
}

func isJSTSFunctionDecl(line string) bool {
	return regexp.MustCompile(`^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s`).MatchString(line)
}

// jstsStatementEnd 从 start 起找语句结束(以 ";" 结尾或到花括号平衡后的行),返回独占下标。
func jstsStatementEnd(lines []string, start int) int {
	depth := 0
	i := start
	for i < len(lines) {
		for _, r := range lines[i] {
			switch r {
			case '{', '(', '[':
				depth++
			case '}', ')', ']':
				if depth > 0 {
					depth--
				}
			}
		}
		i++
		if depth == 0 {
			t := strings.TrimRight(lines[i-1], " \t")
			if strings.HasSuffix(t, ";") || strings.HasSuffix(t, "}") || i == len(lines) {
				return i
			}
			// 无分号也无花括号,认为已结束
			return i
		}
	}
	return i
}

// jstsBlockEnd 找到含有块 {...} 的声明的结束下标(独占)。
func jstsBlockEnd(lines []string, start int) int {
	depth := 0
	seenOpen := false
	i := start
	for i < len(lines) {
		for _, r := range lines[i] {
			switch r {
			case '{':
				depth++
				seenOpen = true
			case '}':
				if depth > 0 {
					depth--
				}
			}
		}
		i++
		if seenOpen && depth == 0 {
			return i
		}
	}
	return i
}

// writeJSTSFunc 写出函数声明签名,函数体替换为 "{ ... }"。
func writeJSTSFunc(out *bytes.Buffer, lines []string, start, end int) {
	// 找到首个 "{" 所在行与列
	openLine, openCol := findFirstOpenBrace(lines, start, end)
	if openLine < 0 {
		// 没有块(如 ambient declare function foo();):原样输出
		for j := start; j < end; j++ {
			out.WriteString(lines[j])
			out.WriteByte('\n')
		}
		return
	}
	for j := start; j < openLine; j++ {
		out.WriteString(lines[j])
		out.WriteByte('\n')
	}
	prefix := lines[openLine][:openCol]
	out.WriteString(prefix)
	out.WriteString("{ ... }\n")
}

// writeJSTSClass 写出类/接口签名与其中的方法/构造器/getter/setter 签名。
func writeJSTSClass(out *bytes.Buffer, lines []string, start, end int) {
	openLine, openCol := findFirstOpenBrace(lines, start, end)
	if openLine < 0 {
		// 接口/类型仅有声明无块:原样输出
		for j := start; j < end; j++ {
			out.WriteString(lines[j])
			out.WriteByte('\n')
		}
		return
	}
	// 头部(含 "{" 那一行完整输出)
	for j := start; j <= openLine; j++ {
		out.WriteString(lines[j])
		out.WriteByte('\n')
	}

	// 扫描类体(不含最后的 "}")
	i := openLine + 1
	// end 指向 "}" 之后一行;真正的 "}" 在 end-1 或更早
	bodyEnd := end - 1
	// 定位类的收尾 "}" 行:向前找第一个只含 "}" 或以 "}" 结尾且深度归零的行,
	// 简化处理直接把 [openLine+1, end-1) 视为类体(end-1 那行含收尾 "}")。
	for i < bodyEnd {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "//") {
			i++
			continue
		}

		if jstsCtorRe.MatchString(line) || jstsGetSetRe.MatchString(line) || jstsMethodStartRe.MatchString(line) {
			mEnd := jstsMethodEnd(lines, i, bodyEnd)
			if mEnd > i {
				writeJSTSMethod(out, lines, i, mEnd)
				i = mEnd
				continue
			}
		}
		// 其它成员(字段、类型属性等)原样输出到该行结束
		sEnd := jstsStatementEnd(lines, i)
		if sEnd > bodyEnd {
			sEnd = bodyEnd
		}
		for j := i; j < sEnd; j++ {
			out.WriteString(lines[j])
			out.WriteByte('\n')
		}
		if sEnd == i {
			i++
		} else {
			i = sEnd
		}
	}

	// 收尾行(通常是 "}")
	out.WriteString(lines[bodyEnd])
	out.WriteByte('\n')
	_ = openCol
}

// jstsMethodEnd 返回类体内一个方法的结束下标(独占)。
// 若方法有块 {...} 则找到匹配的 "}";若为抽象方法/接口方法(以 ";" 结尾无块),
// 则返回语句结束下标。
func jstsMethodEnd(lines []string, start, classBodyEnd int) int {
	// 尝试找到方法的 "{"; 若在到达 ";" 之前没有 "{",视为抽象/接口方法。
	depthParen := 0
	i := start
	for i < classBodyEnd {
		line := lines[i]
		for _, r := range line {
			switch r {
			case '(':
				depthParen++
			case ')':
				if depthParen > 0 {
					depthParen--
				}
			}
		}
		if depthParen == 0 {
			// 该行完整;检查签名后是否有 "{" 或 ";"
			t := strings.TrimRight(line, " \t")
			if strings.HasSuffix(t, "{") {
				// 需要找到匹配的 "}"
				return jstsBlockEndFromLine(lines, i, classBodyEnd)
			}
			if strings.HasSuffix(t, ";") {
				return i + 1
			}
			// 可能签名跨行到下一行才 "{" 或 ";"
			// 继续下一行
		}
		i++
	}
	return i
}

// jstsBlockEndFromLine 从含 "{" 的行开始,返回匹配 "}" 之后一行的下标。
func jstsBlockEndFromLine(lines []string, start, limit int) int {
	depth := 0
	seen := false
	i := start
	for i < limit {
		for _, r := range lines[i] {
			switch r {
			case '{':
				depth++
				seen = true
			case '}':
				if depth > 0 {
					depth--
				}
			}
		}
		i++
		if seen && depth == 0 {
			return i
		}
	}
	return i
}

// writeJSTSMethod 写出方法签名,块体替换为 "{ ... }";若是抽象/接口方法则原样输出。
func writeJSTSMethod(out *bytes.Buffer, lines []string, start, end int) {
	openLine, openCol := findFirstOpenBrace(lines, start, end)
	if openLine < 0 {
		// 无块,原样输出
		for j := start; j < end; j++ {
			out.WriteString(lines[j])
			out.WriteByte('\n')
		}
		return
	}
	for j := start; j < openLine; j++ {
		out.WriteString(lines[j])
		out.WriteByte('\n')
	}
	prefix := lines[openLine][:openCol]
	out.WriteString(prefix)
	out.WriteString("{ ... }\n")
}

// findFirstOpenBrace 在 [start, end) 行范围内找到第一个 "{" 的位置,返回行下标与列下标。
// 若未找到返回 (-1, -1)。会跳过字符串与行注释中的花括号(简易处理)。
func findFirstOpenBrace(lines []string, start, end int) (int, int) {
	for i := start; i < end; i++ {
		line := lines[i]
		inStr := byte(0)
		esc := false
		for j := 0; j < len(line); j++ {
			c := line[j]
			if esc {
				esc = false
				continue
			}
			if inStr != 0 {
				if c == '\\' {
					esc = true
					continue
				}
				if c == inStr {
					inStr = 0
				}
				continue
			}
			switch c {
			case '\'', '"', '`':
				inStr = c
			case '/':
				if j+1 < len(line) && line[j+1] == '/' {
					// 行注释
					j = len(line)
				}
			case '{':
				return i, j
			}
		}
	}
	return -1, -1
}