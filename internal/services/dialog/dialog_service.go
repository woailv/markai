package dialog

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// DialogService 暴露原生系统对话框给前端使用。
// 目前仅提供目录选择器,后续如需文件选择/保存对话框可在此扩展。
type DialogService struct {
	app *application.App
}

// NewDialogService 构造函数。app 必须在 Wails application.New 之后注入,
// 否则原生对话框无法归属主窗口。
func NewDialogService() *DialogService {
	return &DialogService{}
}

// SetApp 注入 Wails application 句柄。由 app 包在装配阶段调用。
func (s *DialogService) SetApp(app *application.App) {
	s.app = app
}

// PickDirectoryInput 目录选择入参。
// Title 为对话框标题;Default 为初始展开目录(可为空,由系统决定)。
type PickDirectoryInput struct {
	Title   string `json:"title,omitempty"`
	Default string `json:"default,omitempty"`
}

// PickDirectoryResult 目录选择结果。
// Canceled=true 时 Path 为空,表示用户取消。
type PickDirectoryResult struct {
	Path     string `json:"path"`
	Canceled bool   `json:"canceled"`
}

// PickDirectory 弹出系统目录选择对话框,返回用户选中的绝对路径。
// 用户取消时返回 Canceled=true,Path="",err=nil。
func (s *DialogService) PickDirectory(in PickDirectoryInput) (*PickDirectoryResult, error) {
	app := s.app
	if app == nil {
		app = application.Get()
	}
	if app == nil {
		// app 未注入时降级为不可用,避免 nil panic。
		return &PickDirectoryResult{Canceled: true}, nil
	}
	title := in.Title
	if title == "" {
		title = "选择目录"
	}
	dlg := app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:                   title,
		CanChooseDirectories:    true,
		CanChooseFiles:          false,
		AllowsMultipleSelection: false,
		Directory:               in.Default,
	})
	path, err := dlg.PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if path == "" {
		return &PickDirectoryResult{Canceled: true}, nil
	}
	return &PickDirectoryResult{Path: path}, nil
}
