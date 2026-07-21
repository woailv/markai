package skeleton

import (
	"bytes"
	"errors"
	"fmt"
	"sort"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

// parse 用给定 language 解析 source,并把 parser 生命周期封闭在函数内。
func parse(source []byte, lang *tree_sitter.Language) (*tree_sitter.Tree, error) {
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(lang); err != nil {
		return nil, fmt.Errorf("skeleton: set language: %w", err)
	}
	tree := parser.Parse(source, nil)
	if tree == nil {
		return nil, errors.New("skeleton: parse returned nil tree")
	}
	return tree, nil
}

// renderTopLevel 遍历 root 的命名子节点,把 keep 中的顶层构造原样输出,
// 期间使用 placeholder 替换 isFunc 匹配的函数/方法的块状函数体。
func renderTopLevel(root *tree_sitter.Node, source []byte, keep, isFunc map[string]bool, placeholder string) string {
	var out bytes.Buffer
	for i := uint(0); i < root.NamedChildCount(); i++ {
		c := root.NamedChild(i)
		if !keep[c.Kind()] {
			continue
		}
		writeSkeleton(c, source, &out, isFunc, placeholder)
		out.WriteByte('\n')
	}
	return out.String()
}

// writeSkeleton 把 node 的原文写入 out,并将其子树内所有属于 isFunc 且拥有块状
// body 的函数节点的 body 范围替换为 placeholder。
func writeSkeleton(node *tree_sitter.Node, source []byte, out *bytes.Buffer, isFunc map[string]bool, placeholder string) {
	var ranges [][2]uint
	collectFuncBodies(node, isFunc, &ranges)
	sort.Slice(ranges, func(i, j int) bool { return ranges[i][0] < ranges[j][0] })

	cur := uint(node.StartByte())
	end := uint(node.EndByte())
	for _, r := range ranges {
		if r[0] < cur || r[0] >= end {
			continue
		}
		out.Write(source[cur:r[0]])
		out.WriteString(placeholder)
		cur = r[1]
	}
	if cur < end {
		out.Write(source[cur:end])
	}
}

// collectFuncBodies 在 node 子树中查找每个 isFunc 匹配的函数节点,取其 body
// 字段;只有 body 为块类型("block" / "statement_block")时才会记录其字节范围,
// 且不再递归进该 body(避免误伤内部结构)。
func collectFuncBodies(node *tree_sitter.Node, isFunc map[string]bool, out *[][2]uint) {
	if isFunc[node.Kind()] {
		if body := node.ChildByFieldName("body"); body != nil {
			k := body.Kind()
			if k == "block" || k == "statement_block" {
				*out = append(*out, [2]uint{uint(body.StartByte()), uint(body.EndByte())})
				return
			}
		}
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		collectFuncBodies(node.NamedChild(i), isFunc, out)
	}
}
