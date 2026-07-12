package services

import (
	"fmt"
	"strings"
)

// unifiedDiff 生成 git 风格的 unified diff。
// oldPath/newPath 用于 --- / +++ 头;当 created=true 时,old 侧显示 /dev/null。
func unifiedDiff(oldPath, newPath, oldText, newText string, created bool) string {
	oldLines := splitLinesKeepEmpty(oldText)
	newLines := splitLinesKeepEmpty(newText)

	hunks := computeHunks(oldLines, newLines, 3)
	if len(hunks) == 0 {
		return ""
	}

	var b strings.Builder
	if created {
		fmt.Fprintf(&b, "--- /dev/null\n")
	} else {
		fmt.Fprintf(&b, "--- a/%s\n", oldPath)
	}
	fmt.Fprintf(&b, "+++ b/%s\n", newPath)
	for _, h := range hunks {
		writeHunk(&b, h)
	}
	return b.String()
}

// splitLinesKeepEmpty 按 \n 切分,不丢失末尾空行信息。
// 空字符串返回空切片(便于 created 场景)。
func splitLinesKeepEmpty(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	// 若末尾恰好以 \n 结尾,Split 会多出一个空串,视为无内容行剔除。
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

type diffOp struct {
	tag  byte // ' ' equal, '-' delete, '+' insert
	line string
}

type hunk struct {
	oldStart, oldCount int
	newStart, newCount int
	ops                []diffOp
}

// computeHunks 基于 LCS 的行级 diff,再按 context 行数聚合为 hunk。
func computeHunks(a, b []string, ctx int) []hunk {
	ops := diffLines(a, b)
	if !hasChange(ops) {
		return nil
	}

	var hunks []hunk
	n := len(ops)
	i := 0
	aIdx, bIdx := 0, 0 // 已消费的原/新行数

	for i < n {
		// 找下一处变更
		if ops[i].tag == ' ' {
			if aIdx < len(a) {
				aIdx++
			}
			if bIdx < len(b) {
				bIdx++
			}
			i++
			continue
		}

		// 向前回溯 ctx 行 context
		start := i
		back := 0
		for start > 0 && ops[start-1].tag == ' ' && back < ctx {
			start--
			back++
		}

		// hunk 起始的行号
		aStart := aIdx - back
		bStart := bIdx - back

		// 收集本 hunk 的 ops:从 start 开始,持续到连续 ctx 行以上的 equal 或结尾
		end := i
		trailingEq := 0
		for end < n {
			if ops[end].tag == ' ' {
				trailingEq++
				if trailingEq > ctx {
					// 检查后面是否还有变更;若无,则截断到最后一个 ctx 之后
					if !hasChangeFrom(ops, end+1) {
						break
					}
				}
			} else {
				trailingEq = 0
			}
			end++
		}
		// 截去多余的尾部 context,只保留 ctx 行
		hunkOps := ops[start:end]
		hunkOps = trimTrailingContext(hunkOps, ctx)

		// 统计 hunk 中 old/new 行数,并推进 aIdx/bIdx 到 end 位置
		aCount, bCount := 0, 0
		for _, op := range hunkOps {
			switch op.tag {
			case ' ':
				aCount++
				bCount++
			case '-':
				aCount++
			case '+':
				bCount++
			}
		}

		hunks = append(hunks, hunk{
			oldStart: aStart + 1, // unified diff 行号从 1 开始
			oldCount: aCount,
			newStart: bStart + 1,
			newCount: bCount,
			ops:      hunkOps,
		})

		// 推进游标:aIdx/bIdx 需要跳到 hunk 结束后的位置
		for _, op := range ops[start:end] {
			switch op.tag {
			case ' ':
				aIdx++
				bIdx++
			case '-':
				aIdx++
			case '+':
				bIdx++
			}
		}
		i = end
	}

	return hunks
}

func trimTrailingContext(ops []diffOp, ctx int) []diffOp {
	// 找到最后一个非 equal 的位置
	lastChange := -1
	for i, op := range ops {
		if op.tag != ' ' {
			lastChange = i
		}
	}
	if lastChange < 0 {
		return ops
	}
	keep := lastChange + 1 + ctx
	if keep > len(ops) {
		keep = len(ops)
	}
	return ops[:keep]
}

func hasChange(ops []diffOp) bool {
	for _, op := range ops {
		if op.tag != ' ' {
			return true
		}
	}
	return false
}

func hasChangeFrom(ops []diffOp, idx int) bool {
	for i := idx; i < len(ops); i++ {
		if ops[i].tag != ' ' {
			return true
		}
	}
	return false
}

// diffLines 使用 LCS 动态规划生成行级 diff 操作序列。
// 对于大文件性能一般,但满足编辑器 diff 提示用途。
func diffLines(a, b []string) []diffOp {
	m, n := len(a), len(b)
	// dp[i][j] = LCS 长度
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if a[i-1] == b[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else if dp[i-1][j] >= dp[i][j-1] {
				dp[i][j] = dp[i-1][j]
			} else {
				dp[i][j] = dp[i][j-1]
			}
		}
	}

	// 回溯
	var rev []diffOp
	i, j := m, n
	for i > 0 && j > 0 {
		if a[i-1] == b[j-1] {
			rev = append(rev, diffOp{tag: ' ', line: a[i-1]})
			i--
			j--
		} else if dp[i-1][j] >= dp[i][j-1] {
			rev = append(rev, diffOp{tag: '-', line: a[i-1]})
			i--
		} else {
			rev = append(rev, diffOp{tag: '+', line: b[j-1]})
			j--
		}
	}
	for i > 0 {
		rev = append(rev, diffOp{tag: '-', line: a[i-1]})
		i--
	}
	for j > 0 {
		rev = append(rev, diffOp{tag: '+', line: b[j-1]})
		j--
	}

	// 反转
	ops := make([]diffOp, len(rev))
	for k, op := range rev {
		ops[len(rev)-1-k] = op
	}
	return ops
}

func writeHunk(b *strings.Builder, h hunk) {
	fmt.Fprintf(b, "@@ -%d,%d +%d,%d @@\n", h.oldStart, h.oldCount, h.newStart, h.newCount)
	for _, op := range h.ops {
		b.WriteByte(op.tag)
		b.WriteString(op.line)
		b.WriteByte('\n')
	}
}