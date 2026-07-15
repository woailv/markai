package services

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/config"
	"prompttool/internal/db"
)

// RegistryResult 打包 Registry 的产物。除了 Wails 使用的 Service 切片,
// 还额外返回需要在 app 层做生命周期管理的 Service 引用
// (WorkspaceService, DialogService, RecentService)。
type RegistryResult struct {
	Services  []application.Service
	Workspace *WorkspaceService
	Dialog    *DialogService
	Recent    *RecentService
}

// Registry 汇总所有暴露给前端的 Service。
// 新增 Service 时只需在此处 append,main/app 层无需改动。
// database 参数供需要持久化的 Service 注入使用。
func Registry(database *db.DB) (*RegistryResult, error) {
	promptSvc, err := NewPromptTemplateService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init prompt template: %w", err)
	}
	convSvc, err := NewConversationService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init conversation: %w", err)
	}
	snapshotSvc, err := NewSnapshotService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init snapshot: %w", err)
	}
	recentSvc, err := NewRecentService(database)
	if err != nil {
		return nil, fmt.Errorf("services: init recent: %w", err)
	}
	workspaceSvc := NewWorkspaceService(config.DefaultWorkspace())
	workspaceSvc.setRecent(recentSvc)
	dialogSvc := NewDialogService()
	return &RegistryResult{
		Services: []application.Service{
			application.NewService(NewGreetService()),
			application.NewService(promptSvc),
			application.NewService(NewFileService(snapshotSvc)),
			application.NewService(convSvc),
			application.NewService(snapshotSvc),
			application.NewService(workspaceSvc),
			application.NewService(dialogSvc),
			application.NewService(recentSvc),
		},
		Workspace: workspaceSvc,
		Dialog:    dialogSvc,
		Recent:    recentSvc,
	}, nil
}
