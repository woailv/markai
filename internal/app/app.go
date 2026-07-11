package app

import (
	"context"
	"io/fs"
	"log/slog"

	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
	"prompttool/internal/services"
	"prompttool/internal/window"
)

// App 封装 Wails application 及其依赖,便于集中管理生命周期。
type App struct {
	wails  *application.App
	logger *slog.Logger
	cancel context.CancelFunc
}

// New 装配 Wails 应用:配置、Service、窗口、事件、后台任务。
func New(assets fs.FS, logger *slog.Logger) *App {
	cfg := config.Default()

	wailsApp := application.New(application.Options{
		Name:        cfg.Name,
		Description: cfg.Description,
		Services:    services.Registry(),
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	window.NewMain(wailsApp, config.DefaultWindow())

	ctx, cancel := context.WithCancel(context.Background())
	StartTimeTicker(ctx, wailsApp)

	return &App{
		wails:  wailsApp,
		logger: logger,
		cancel: cancel,
	}
}

// Run 启动事件循环,阻塞直到应用退出。
func (a *App) Run() error {
	defer a.cancel()
	if err := a.wails.Run(); err != nil {
		a.logger.Error("application exited with error", "err", err)
		return err
	}
	return nil
}