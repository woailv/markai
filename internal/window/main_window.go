package window

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
)

// NewMain 创建并注册主窗口。
// 开启 EnableFileDrop 以启用 native 文件拖放,
// 由此可通过 WindowFilesDropped 事件拿到文件绝对路径。
//
// 重要:Wails v3 alpha 里,只有带 `data-file-drop-target` 属性的
// DOM 元素上的拖放才会触发 FilesDropped 事件。前端拖放目标区域
// 必须在容器上加该 data 属性,否则事件不会触发。
func NewMain(app *application.App, cfg config.WindowConfig) *application.WebviewWindow {
	return app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          cfg.Title,
		Width:          cfg.Width,
		Height:         cfg.Height,
		EnableFileDrop: true,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: cfg.Background,
		URL:              "/",
	})
}