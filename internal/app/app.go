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
	wails  *application.App
	logger *slog.Logger
	db     *db.DB
	cancel context.CancelFunc
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
	); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			logger.Error("close db after migrate failure", "err", closeErr)
		}
		return nil, fmt.Errorf("app: migrate schema: %w", err)
	}

	svcList, err := services.Registry(database)
	if err != nil {
		if closeErr := database.Close(); closeErr != nil {
			logger.Error("close db after service init failure", "err", closeErr)
		}
		return nil, fmt.Errorf("app: init services: %w", err)
	}

	wailsApp := application.New(application.Options{
		Name:        cfg.Name,
		Description: cfg.Description,
		Services:    svcList,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	mainWin := window.NewMain(wailsApp, config.DefaultWindow())
	registerFilesDropForward(wailsApp, mainWin, logger)

	ctx, cancel := context.WithCancel(context.Background())
	StartTimeTicker(ctx, wailsApp)

	return &App{
		wails:  wailsApp,
		logger: logger,
		db:     database,
		cancel: cancel,
	}, nil
}

// Run 启动事件循环,阻塞直到应用退出。
func (a *App) Run() error {
	defer a.cancel()
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