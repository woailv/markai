package skeleton

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_go "github.com/tree-sitter/tree-sitter-go/bindings/go"
)

var (
	goKeep = map[string]bool{
		"package_clause":       true,
		"import_declaration":   true,
		"type_declaration":     true,
		"const_declaration":    true,
		"var_declaration":      true,
		"function_declaration": true,
		"method_declaration":   true,
	}
	goIsFunc = map[string]bool{
		"function_declaration": true,
		"method_declaration":   true,
		"func_literal":         true,
	}
)

func extractGo(source []byte) (string, error) {
	lang := tree_sitter.NewLanguage(tree_sitter_go.Language())
	tree, err := parse(source, lang)
	if err != nil {
		return "", err
	}
	defer tree.Close()
	return renderTopLevel(tree.RootNode(), source, goKeep, goIsFunc, "{ ... }"), nil
}
