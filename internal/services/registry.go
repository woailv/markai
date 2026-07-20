package services

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
	"prompttool/internal/db"
	"prompttool/internal/services/clipboard"
	"prompttool/internal/services/conversation"
	"prompttool/internal/services/dialog"
	"prompttool/internal/services/file"
	"prompttool/internal/services/greet"
	"prompttool/internal/services/prompt"
	"prompttool/internal/services/recent"
	"prompttool/internal/services/snapshot"
	"prompttool/internal/services/tray"
	"prompttool/internal/services/windowstate"
	"prompttool/internal/services/workspace"
)

// RegistryResult 打包 Registry 的产物。除了 Wails 使用的 Service 切片,
// 还额外返回需要在 app 层做生命周期管理的 Service 引用
// (WorkspaceService, DialogService, RecentService, WindowService, TrayService)。
type RegistryResult struct {
	Services  []application.Service
	Workspace *workspace.WorkspaceService
	Dialog    *dialog.DialogService
	Recent    *recent.RecentService
	Window    *windowstate.WindowService
	Tray      *tray.TrayService
}

// Registry 汇总所有暴露给前端的 Service。
// 新增 Service 时只需在此处 append,main/app 层无需改动。
// database 参数供需要持久化的 Service 注入使用。
func Registry(database *db.DB) (*RegistryResult, error) {
	promptSvc, err := prompt.NewPromptTemplateService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init prompt template: %w", err)
	}
	// snapshot 先构造:ConversationService 依赖它做会话级联清理。
	snapshotSvc, err := snapshot.NewSnapshotService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init snapshot: %w", err)
	}
	convSvc, err := conversation.NewConversationService(database, snapshotSvc)
	if err != nil {
		return nil, fmt.Errorf("services: init conversation: %w", err)
	}
	recentSvc, err := recent.NewRecentService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init recent: %w", err)
	}
	windowSvc, err := windowstate.NewWindowService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init window: %w", err)
	}
	workspaceSvc := workspace.NewWorkspaceService(config.DefaultWorkspace(), recentSvc)
	dialogSvc := dialog.NewDialogService()
	traySvc := tray.NewTrayService()
	return &RegistryResult{
		Services: []application.Service{
			application.NewService(greet.NewGreetService()),
			application.NewService(promptSvc),
			application.NewService(file.NewFileService(snapshotSvc)),
			application.NewService(convSvc),
			application.NewService(snapshotSvc),
			application.NewService(workspaceSvc),
			application.NewService(dialogSvc),
			application.NewService(recentSvc),
			application.NewService(windowSvc),
			application.NewService(clipboard.NewClipboardService()),
			application.NewService(traySvc),
		},
		Workspace: workspaceSvc,
		Dialog:    dialogSvc,
		Recent:    recentSvc,
		Window:    windowSvc,
		Tray:      traySvc,
	}, nil
}
