package skeleton

import (
	"bufio"
	"bytes"
	"regexp"
	"strings"
)

var (
	// 顶层 import / from ... import
	pyImportRe = regexp.MustCompile(`^(?:import|from)\s+\S`)
	// 顶层 def / async def / class,允许前置装饰器行 @xxx
	pyDefRe   = regexp.MustCompile(`^(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(`)
	pyClassRe = regexp.MustCompile(`^class\s+[A-Za-z_]\w*\b`)
	pyDecoRe  = regexp.MustCompile(`^@[A-Za-z_]`)
	// 顶层赋值 / 类型注解: NAME = ... 或 NAME: TYPE = ...
	pyAssignRe = regexp.MustCompile(`^[A-Za-z_]\w*\s*(?::[^=]+)?=\s*`)
)

// extractPython 通过基于缩进的正则扫描提取骨架:保留顶层 import、
// 顶层赋值、顶层 class(仅签名 + 内部方法签名),以及顶层 def/async def
// 的签名(函数体替换为 "pass")。
func extractPython(source []byte) (string, error) {
	lines := splitLines(source)
	var out bytes.Buffer

	i := 0
	for i < len(lines) {
		raw := lines[i]
		trimmed := strings.TrimLeft(raw, " \t")
		indent := len(raw) - len(trimmed)

		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			i++
			continue
		}
		if indent != 0 {
			i++
			continue
		}

		switch {
		case pyImportRe.MatchString(trimmed):
			out.WriteString(raw)
			out.WriteByte('\n')
			i++
		case pyDecoRe.MatchString(trimmed):
			// 收集装饰器块,直到遇到 def/class
			start := i
			for i < len(lines) {
				t := strings.TrimLeft(lines[i], " \t")
				ind := len(lines[i]) - len(t)
				if ind != 0 {
					i++
					continue
				}
				if pyDecoRe.MatchString(t) {
					i++
					continue
				}
				break
			}
			// 现在 i 指向 def/class 或其它;把装饰器一并写出,交给下面处理
			for j := start; j < i; j++ {
				out.WriteString(lines[j])
				out.WriteByte('\n')
			}
		case pyClassRe.MatchString(trimmed):
			end := pyBlockEnd(lines, i)
			writePyClass(&out, lines, i, end)
			i = end
		case pyDefRe.MatchString(trimmed):
			end := pyBlockEnd(lines, i)
			writePyFuncSig(&out, lines, i, end, 0)
			i = end
		case pyAssignRe.MatchString(trimmed):
			out.WriteString(raw)
			out.WriteByte('\n')
			i++
		default:
			i++
		}
	}
	return out.String(), nil
}

// pyBlockEnd 返回从 start 行(顶层 def/class 的签名首行)开始的整个块
// 的结束下标(独占,即返回值本身不属于该块)。
func pyBlockEnd(lines []string, start int) int {
	// 找到签名的结束行(处理跨行括号)
	sigEnd := pyStatementEnd(lines, start)
	// 之后所有缩进 > 0 或空行的行都属于块
	i := sigEnd
	for i < len(lines) {
		l := lines[i]
		trimmed := strings.TrimLeft(l, " \t")
		if trimmed == "" {
			i++
			continue
		}
		indent := len(l) - len(trimmed)
		if indent == 0 {
			break
		}
		i++
	}
	return i
}

// pyStatementEnd 返回签名逻辑行的结束下标(独占)。
// 通过跟踪括号平衡与显式续行符 "\" 处理多行签名。
func pyStatementEnd(lines []string, start int) int {
	depth := 0
	i := start
	for i < len(lines) {
		l := lines[i]
		for _, r := range l {
			switch r {
			case '(', '[', '{':
				depth++
			case ')', ']', '}':
				if depth > 0 {
					depth--
				}
			}
		}
		i++
		if depth <= 0 && !strings.HasSuffix(strings.TrimRight(l, " \t"), "\\") {
			return i
		}
	}
	return i
}

// writePyFuncSig 写出一个 def/async def 的签名(可能跨多行),然后追加
// 一行 "pass",缩进为签名缩进 + 4 空格。baseIndent 用于内部方法。
func writePyFuncSig(out *bytes.Buffer, lines []string, start, end int, _ int) {
	sigEnd := pyStatementEnd(lines, start)
	if sigEnd > end {
		sigEnd = end
	}
	for j := start; j < sigEnd; j++ {
		out.WriteString(lines[j])
		out.WriteByte('\n')
	}
	// 计算缩进
	first := lines[start]
	trimmed := strings.TrimLeft(first, " \t")
	indent := first[:len(first)-len(trimmed)]
	out.WriteString(indent)
	out.WriteString("    pass\n")
}

// writePyClass 写出 class 签名与其内部方法签名,忽略类体内其它内容。
func writePyClass(out *bytes.Buffer, lines []string, start, end int) {
	sigEnd := pyStatementEnd(lines, start)
	if sigEnd > end {
		sigEnd = end
	}
	for j := start; j < sigEnd; j++ {
		out.WriteString(lines[j])
		out.WriteByte('\n')
	}

	hasBody := false
	i := sigEnd
	for i < end {
		l := lines[i]
		trimmed := strings.TrimLeft(l, " \t")
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			i++
			continue
		}
		indent := len(l) - len(trimmed)
		if indent == 0 {
			break
		}
		// 仅记录该缩进层级(直接子成员)的 def/装饰器
		// 找出类体基础缩进(第一个非空非注释子行的缩进)
		if pyDecoRe.MatchString(trimmed) {
			// 装饰器成块输出
			start2 := i
			for i < end {
				t := strings.TrimLeft(lines[i], " \t")
				if t == "" || strings.HasPrefix(t, "#") {
					i++
					continue
				}
				ind := len(lines[i]) - len(t)
				if ind == 0 {
					break
				}
				if pyDecoRe.MatchString(t) {
					i++
					continue
				}
				break
			}
			for j := start2; j < i; j++ {
				out.WriteString(lines[j])
				out.WriteByte('\n')
			}
			hasBody = true
			continue
		}
		if pyDefRe.MatchString(trimmed) {
			methodEnd := pyMethodEnd(lines, i, end)
			writePyFuncSig(out, lines, i, methodEnd, indent)
			i = methodEnd
			hasBody = true
			continue
		}
		i++
	}
	if !hasBody {
		// 保证 class 体合法
		// 使用签名首行缩进 + 4 空格
		first := lines[start]
		trimmed := strings.TrimLeft(first, " \t")
		indent := first[:len(first)-len(trimmed)]
		out.WriteString(indent)
		out.WriteString("    pass\n")
	}
}

// pyMethodEnd 返回类内某方法块的结束下标(独占),限制不超过 classEnd。
func pyMethodEnd(lines []string, start, classEnd int) int {
	sigEnd := pyStatementEnd(lines, start)
	if sigEnd > classEnd {
		return classEnd
	}
	first := lines[start]
	trimmed := strings.TrimLeft(first, " \t")
	methodIndent := len(first) - len(trimmed)

	i := sigEnd
	for i < classEnd {
		l := lines[i]
		t := strings.TrimLeft(l, " \t")
		if t == "" {
			i++
			continue
		}
		ind := len(l) - len(t)
		if ind <= methodIndent {
			break
		}
		i++
	}
	return i
}

// splitLines 按 \n 切分并保留原文(不含换行符本身)。
func splitLines(source []byte) []string {
	var out []string
	sc := bufio.NewScanner(bytes.NewReader(source))
	sc.Buffer(make([]byte, 64*1024), 10*1024*1024)
	for sc.Scan() {
		out = append(out, sc.Text())
	}
	return out
}