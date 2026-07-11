package services

import "github.com/wailsapp/wails/v3/pkg/application"

// Registry 汇总所有暴露给前端的 Service。
// 新增 Service 时只需在此处 append,main/app 层无需改动。
func Registry() []application.Service {
	return []application.Service{
		application.NewService(NewGreetService()),
	}
}