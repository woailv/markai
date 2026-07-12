package app

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FilesDroppedPayload 拖放事件转发给前端的负载。
// Paths 为绝对路径列表。
// 注:Wails v3 alpha2.117 的 WindowEventContext 未稳定提供拖放坐标,
// 前端一律落到当前光标位置插入。
type FilesDroppedPayload struct {
	Paths []string `json:"paths"`
}

// EventFilesDropped 前端订阅的事件名。
const EventFilesDropped = "files:dropped"

// RegisterEvents 在应用启动前注册事件类型。
func RegisterEvents() {
	application.RegisterEvent[string]("time")
	application.RegisterEvent[FilesDroppedPayload](EventFilesDropped)
}

// StartTimeTicker 每秒向前端广播当前时间。
// 通过 ctx 控制生命周期,避免 goroutine 泄漏。
func StartTimeTicker(ctx context.Context, app *application.App) {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case t := <-ticker.C:
				app.Event.Emit("time", t.Format(time.RFC1123))
			}
		}
	}()
}