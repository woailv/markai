package skeleton

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_python "github.com/tree-sitter/tree-sitter-python/bindings/go"
)

var (
	pythonKeep = map[string]bool{
		"import_statement":      true,
		"import_from_statement": true,
		"class_definition":      true,
		"function_definition":   true,
		"decorated_definition":  true,
		"expression_statement":  true, // 顶层赋值等
	}
	pythonIsFunc = map[string]bool{
		"function_definition": true,
	}
)

func extractPython(source []byte) (string, error) {
	lang := tree_sitter.NewLanguage(tree_sitter_python.Language())
	tree, err := parse(source, lang)
	if err != nil {
		return "", err
	}
	defer tree.Close()
	return renderTopLevel(tree.RootNode(), source, pythonKeep, pythonIsFunc, "pass"), nil
}
