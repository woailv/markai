package services

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/db"
)

// Registry 汇总所有暴露给前端的 Service。
// 新增 Service 时只需在此处 append,main/app 层无需改动。
// database 参数供需要持久化的 Service 注入使用。
func Registry(database *db.DB) ([]application.Service, error) {
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
	return []application.Service{
		application.NewService(NewGreetService()),
		application.NewService(promptSvc),
		application.NewService(NewFileService(snapshotSvc)),
		application.NewService(convSvc),
		application.NewService(snapshotSvc),
	}, nil
}