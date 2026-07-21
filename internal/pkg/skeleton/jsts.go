package skeleton

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_javascript "github.com/tree-sitter/tree-sitter-javascript/bindings/go"
	tree_sitter_typescript "github.com/tree-sitter/tree-sitter-typescript/bindings/go"
)

var (
	jstsKeep = map[string]bool{
		"import_statement":               true,
		"export_statement":               true,
		"class_declaration":              true,
		"abstract_class_declaration":     true,
		"interface_declaration":          true,
		"type_alias_declaration":         true,
		"enum_declaration":               true,
		"function_declaration":           true,
		"generator_function_declaration": true,
		"lexical_declaration":            true,
		"variable_declaration":           true,
	}
	jstsIsFunc = map[string]bool{
		"function_declaration":           true,
		"generator_function_declaration": true,
		"method_definition":              true,
		"function_expression":            true,
		"generator_function":             true,
		"arrow_function":                 true,
	}
)

func extractJS(source []byte) (string, error) {
	return extractJSTS(source, tree_sitter.NewLanguage(tree_sitter_javascript.Language()))
}

func extractTS(source []byte) (string, error) {
	return extractJSTS(source, tree_sitter.NewLanguage(tree_sitter_typescript.LanguageTypescript()))
}

func extractTSX(source []byte) (string, error) {
	return extractJSTS(source, tree_sitter.NewLanguage(tree_sitter_typescript.LanguageTSX()))
}

func extractJSTS(source []byte, lang *tree_sitter.Language) (string, error) {
	tree, err := parse(source, lang)
	if err != nil {
		return "", err
	}
	defer tree.Close()
	return renderTopLevel(tree.RootNode(), source, jstsKeep, jstsIsFunc, "{ ... }"), nil
}
