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
// startInTray 为 true 表示应用启动即处于托盘模式:
//   - 窗口以 Hidden 状态创建(用户不可见);
//   - Windows 下从任务栏隐藏(HiddenOnTaskbar),配合托盘图标运行,
//     贴近 demo/systray-custom 的体验。
//   - 用户通过托盘菜单/点击唤出后才显示窗口。
//
// 重要:Wails v3 alpha 里,只有带 `data-file-drop-target` 属性的
// DOM 元素上的拖放才会触发 FilesDropped 事件。前端拖放目标区域
// 必须在容器上加该 data 属性,否则事件不会触发。
func NewMain(app *application.App, cfg config.WindowConfig, alwaysOnTop bool, startInTray bool) *application.WebviewWindow {
	// 托盘模式下:窗口无系统标题栏、不可拖动/缩放、常驻置顶,
	// 由 TrayService 通过 AttachWindow 将其锚定到托盘图标(右下角)。
	// 关闭窗口时拦截为隐藏,保持应用后台运行。
	opts := application.WebviewWindowOptions{
		DevToolsEnabled: true,
		Title:           cfg.Title,
		Width:           cfg.Width,
		Height:          cfg.Height,
		EnableFileDrop:  true,
		AlwaysOnTop:     alwaysOnTop || startInTray,
		Hidden:          startInTray,
		Frameless:       startInTray,
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: startInTray,
		},
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