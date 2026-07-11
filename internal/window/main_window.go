package window

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
)

// NewMain 创建并注册主窗口。
func NewMain(app *application.App, cfg config.WindowConfig) *application.WebviewWindow {
	return app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  cfg.Title,
		Width:  cfg.Width,
		Height: cfg.Height,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: cfg.Background,
		URL:              "/",
	})
}