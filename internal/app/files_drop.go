package app

import (
	"log/slog"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// registerFilesDropForward 在指定窗口上监听 native 文件拖放事件,
// 并将绝对路径与坐标转发给前端(事件名: files:dropped)。
//
// 依赖 WebviewWindowOptions.EnableDragAndDrop = true 才能收到该事件。
func registerFilesDropForward(app *application.App, win *application.WebviewWindow, logger *slog.Logger) {
	win.OnWindowEvent(events.Common.WindowFilesDropped, func(evt *application.WindowEvent) {
		ctx := evt.Context()
		paths := ctx.DroppedFiles()
		if len(paths) == 0 {
			return
		}
		payload := FilesDroppedPayload{Paths: paths}
		logger.Debug("files dropped", "count", len(paths))
		app.Event.Emit(EventFilesDropped, payload)
	})
}
