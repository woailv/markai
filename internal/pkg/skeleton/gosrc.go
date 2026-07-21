package skeleton

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"strings"
)

// extractGo 使用 go/parser + go/ast 解析 Go 源码,保留包声明、import、
// 类型/常量/变量声明,以及函数与方法签名(函数体替换为 "{ ... }")。
func extractGo(source []byte) (string, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "", source, parser.ParseComments|parser.SkipObjectResolution)
	if err != nil {
		return "", fmt.Errorf("skeleton: parse go: %w", err)
	}

	var out bytes.Buffer

	// package 声明
	fmt.Fprintf(&out, "package %s\n\n", file.Name.Name)

	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			writeGoFuncSig(&out, fset, d)
			out.WriteString("\n\n")
		case *ast.GenDecl:
			// import / type / const / var
			if err := writeGoGenDecl(&out, fset, d); err != nil {
				return "", err
			}
			out.WriteString("\n\n")
		}
	}
	return strings.TrimRight(out.String(), "\n") + "\n", nil
}

// writeGoFuncSig 输出函数/方法签名,函数体固定替换为 "{ ... }"。
func writeGoFuncSig(out *bytes.Buffer, fset *token.FileSet, fn *ast.FuncDecl) {
	// 通过临时构造一个只含签名的 FuncDecl 打印;把 Body 置 nil 会得到形如
	// "func Foo()" 的裸签名,再手动附加占位符,避免 printer 输出末尾分号。
	stripped := *fn
	stripped.Body = nil
	stripped.Doc = nil

	var buf bytes.Buffer
	cfg := printer.Config{Mode: printer.UseSpaces | printer.TabIndent, Tabwidth: 4}
	if err := cfg.Fprint(&buf, fset, &stripped); err != nil {
		// 打印失败时退化为一行简短签名占位符
		fmt.Fprintf(out, "// <unprintable func %s>", fn.Name.Name)
		return
	}
	sig := strings.TrimRight(buf.String(), " \t\n")
	out.WriteString(sig)
	out.WriteString(" { ... }")
}

// writeGoGenDecl 原样打印 import / type / const / var 声明。
func writeGoGenDecl(out *bytes.Buffer, fset *token.FileSet, d *ast.GenDecl) error {
	stripped := *d
	stripped.Doc = nil
	var buf bytes.Buffer
	cfg := printer.Config{Mode: printer.UseSpaces | printer.TabIndent, Tabwidth: 4}
	if err := cfg.Fprint(&buf, fset, &stripped); err != nil {
		return fmt.Errorf("skeleton: print gendecl: %w", err)
	}
	out.Write(bytes.TrimRight(buf.Bytes(), " \t\n"))
	return nil
}