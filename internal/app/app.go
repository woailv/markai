package app

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

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
		&services.WindowSetting{},
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

	// 读取托盘模式偏好。若上次退出时处于托盘模式,本次以"托盘常驻"
	// 形态启动:Windows 下禁用"最后窗口关闭即退出",配合窗口隐藏
	// 实现与 demo/systray-custom 一致的后台运行体验。
	// 读取失败降级为 false,不阻塞启动。
	startInTray := false
	if registry.Window != nil {
		if v, err := registry.Window.LoadPersistedTrayMode(); err != nil {
			logger.Error("load persisted tray mode", "err", err)
		} else {
			startInTray = v
		}
	}

	wailsApp := application.New(application.Options{
		Name:        cfg.Name,
		Description: cfg.Description,
		Services:    registry.Services,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: !startInTray,
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: startInTray,
		},
		KeyBindings: map[string]func(window application.Window){
			"F12": func(window application.Window) {
				window.OpenDevTools()
			},
		},
	})
	// 监听应用启动完成事件
	unsubFunc := wailsApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(event *application.ApplicationEvent) {

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

	// 先读取持久化的置顶状态,用于构造窗口时应用初始值。
	// 读取失败时降级为 false,并记录日志,不阻塞启动。
	alwaysOnTop := false
	if registry.Window != nil {
		if v, err := registry.Window.LoadPersistedAlwaysOnTop(); err != nil {
			logger.Error("load persisted always-on-top", "err", err)
		} else {
			alwaysOnTop = v
		}
	}

	mainWin := window.NewMain(wailsApp, config.DefaultWindow(), alwaysOnTop, startInTray)
	registerFilesDropForward(wailsApp, mainWin, logger)

	// 注入置顶设置器、显示/隐藏设置器与事件推送。setter 通过闭包
	// 捕获主窗口,使 WindowService 无需感知 Wails 类型。
	// 初始可见性与 startInTray 相反:托盘启动时窗口先隐藏。
	if registry.Window != nil {
		registry.Window.SetEmitter(emitter)
		registry.Window.SetSetter(func(enabled bool) {
			if mainWin != nil {
				mainWin.SetAlwaysOnTop(enabled)
			}
		})
		registry.Window.SetVisibilitySetter(func(visible bool) {
			if mainWin == nil {
				return
			}
			if visible {
				mainWin.Show()
			} else {
				mainWin.Hide()
			}
		})
		registry.Window.SetInitialVisibility(!startInTray)
	}

	// 注入托盘依赖:Wails 应用、主窗口引用与持久化回调。
	// TrayService 由前端主动调用 EnableTray 触发进入托盘模式;
	// 若启动时已处于托盘模式,则在此处直接激活,恢复上次形态。
	if registry.Tray != nil {
		registry.Tray.SetApp(wailsApp)
		registry.Tray.SetWindow(mainWin)
		if registry.Window != nil {
			registry.Tray.SetPersister(registry.Window.SavePersistedTrayMode)
		}
		if startInTray {
			if err := registry.Tray.EnableTray(); err != nil {
				logger.Error("enable tray on startup", "err", err)
			}
		}
	}

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
