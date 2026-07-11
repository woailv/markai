package app

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// RegisterEvents 在应用启动前注册事件类型。
func RegisterEvents() {
	application.RegisterEvent[string]("time")
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