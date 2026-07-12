package app

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FilesDroppedPayload 拖放事件转发给前端的负载。
// Paths 为绝对路径列表;当 native 层提供 DropTargetDetails 时,
// 一并携带命中的目标元素信息与视口坐标,便于前端精确定位到光标位置插入。
type FilesDroppedPayload struct {
	Paths     []string `json:"paths"`
	X         int      `json:"x"`
	Y         int      `json:"y"`
	ElementID string   `json:"elementId,omitempty"`
	HasCoords bool     `json:"hasCoords"`
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