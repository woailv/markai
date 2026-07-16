package app

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
	"prompttool/internal/db"
	"prompttool/internal/services"
	"prompttool/internal/window"
)

// App 封装 Wails application 及其依赖,便于集中管理生命周期。
type App struct {
	wails     *application.App
	logger    *slog.Logger
	db        *db.DB
	workspace *services.WorkspaceService
	cancel    context.CancelFunc
}

// wailsEmitter 将 Wails application 适配为 services.Emitter,
// 供 WorkspaceService 向前端推送文件变更事件。
type wailsEmitter struct {
	app *application.App
}

func (e *wailsEmitter) EmitEvent(name string, data any) {
	if e == nil || e.app == nil {
		return
	}
	e.app.Event.Emit(name, data)
}

// New 装配 Wails 应用:配置、数据库、Service、窗口、事件、后台任务。
func New(assets fs.FS, logger *slog.Logger) (*App, error) {
	cfg := config.Default()

	database, err := db.Open(db.Config{Path: config.DefaultDB().Path}, logger)
	if err != nil {
		return nil, fmt.Errorf("app: init db: %w", err)
	}

	if err := database.AutoMigrate(
		&db.Conversation{},
		&db.Message{},
		&db.SnapshotBatch{},
		&db.FileSnapshot{},
		&services.RecentItem{},
	); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			logger.Error("close db after migrate failure", "err", closeErr)
		}
		return nil, fmt.Errorf("app: migrate schema: %w", err)
	}

	registry, err := services.Registry(database)
	if err != nil {
		if closeErr := database.Close(); closeErr != nil {
			logger.Error("close db after service init failure", "err", closeErr)
		}
		return nil, fmt.Errorf("app: init services: %w", err)
	}

	wailsApp := application.New(application.Options{
		Name:        cfg.Name,
		Description: cfg.Description,
		Services:    registry.Services,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		KeyBindings: map[string]func(window application.Window){
			"F12": func(window application.Window) {
				window.OpenDevTools()
			},
		},
	})

	if registry.Dialog != nil {
		registry.Dialog.SetApp(wailsApp)
	}

	emitter := &wailsEmitter{app: wailsApp}

	// 注入事件推送能力并启动工作区监听。启动失败已在 Service 内部降级,
	// 这里只记录日志,不阻塞应用启动。
	if registry.Workspace != nil {
		registry.Workspace.SetEmitter(emitter)
		if info, err := registry.Workspace.Start(); err != nil {
			logger.Error("workspace watcher start", "err", err)
		} else if info != nil && !info.Watching {
			logger.Warn("workspace watcher not active", "reason", info.Reason, "degraded", info.Degraded)
		}
	}

	if registry.Recent != nil {
		registry.Recent.SetEmitter(emitter)
	}

	mainWin := window.NewMain(wailsApp, config.DefaultWindow())
	registerFilesDropForward(wailsApp, mainWin, logger)

	ctx, cancel := context.WithCancel(context.Background())
	StartTimeTicker(ctx, wailsApp)

	return &App{
		wails:     wailsApp,
		logger:    logger,
		db:        database,
		workspace: registry.Workspace,
		cancel:    cancel,
	}, nil
}

// Run 启动事件循环,阻塞直到应用退出。
func (a *App) Run() error {
	defer a.cancel()
	defer func() {
		if a.workspace != nil {
			a.workspace.Stop()
		}
	}()
	defer func() {
		if err := a.db.Close(); err != nil {
			a.logger.Error("close db", "err", err)
		}
	}()
	if err := a.wails.Run(); err != nil {
		a.logger.Error("application exited with error", "err", err)
		return err
	}
	return nil
}
