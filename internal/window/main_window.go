package window

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
)

// NewMain 创建并注册主窗口。
// 开启 EnableFileDrop 以启用 native 文件拖放,
// 由此可通过 WindowFilesDropped 事件拿到文件绝对路径。
//
// alwaysOnTop 为窗口初始置顶状态,由 app 层从持久化配置读取后传入,
// 以便应用启动时即恢复上次的置顶偏好。
//
// startInTray 为 true 表示应用启动时窗口先隐藏(用户通过托盘图标唤出),
// 但窗口形态与普通模式保持一致 —— 有系统标题栏、可拖动/缩放、正常出现
// 在任务栏,只是初始不可见。托盘仅作为一个附加的图标入口存在,不改变
// 主窗口本身的 UI 形态。
//
// 重要:Wails v3 alpha 里,只有带 `data-file-drop-target` 属性的
// DOM 元素上的拖放才会触发 FilesDropped 事件。前端拖放目标区域
// 必须在容器上加该 data 属性,否则事件不会触发。
func NewMain(app *application.App, cfg config.WindowConfig, alwaysOnTop bool, startInTray bool) *application.WebviewWindow {
	opts := application.WebviewWindowOptions{
		DevToolsEnabled: true,
		Title:           cfg.Title,
		Width:           cfg.Width,
		Height:          cfg.Height,
		EnableFileDrop:  true,
		AlwaysOnTop:     alwaysOnTop,
		Hidden:          startInTray,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: cfg.Background,
		URL:              "/",
	}

	return app.Window.NewWithOptions(opts)
}