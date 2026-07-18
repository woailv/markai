package app

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// moveWindowToBottomRight 将窗口移动到其所在屏幕工作区的右下角。
// 语义:窗口右边缘与工作区右边缘距离 0,窗口下边缘与工作区底边缘
// (即任务栏/状态栏上沿)距离 0。
//
// 坐标计算:
//   x = workArea.X + workArea.Width  - windowWidth
//   y = workArea.Y + workArea.Height - windowHeight
//
// 使用窗口当前所在屏幕的 WorkArea(不含任务栏),以支持多显示器场景。
func moveWindowToBottomRight(app *application.App, win *application.WebviewWindow) error {
	if app == nil || win == nil {
		return fmt.Errorf("window position: app or window is nil")
	}

	screen, err := win.GetScreen()
	if err != nil {
		return fmt.Errorf("window position: get screen: %w", err)
	}
	if screen == nil {
		return fmt.Errorf("window position: screen is nil")
	}

	winW, winH := win.Size()
	work := screen.WorkArea

	x := work.X + work.Width - winW
	y := work.Y + work.Height - winH

	win.SetPosition(x, y)
	return nil
}