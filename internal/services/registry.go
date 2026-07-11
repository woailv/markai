package services

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"prompttool/internal/db"
)

// Registry 汇总所有暴露给前端的 Service。
// 新增 Service 时只需在此处 append,main/app 层无需改动。
// database 参数供需要持久化的 Service 注入使用。
func Registry(database *db.DB) []application.Service {
	_ = database // 预留:后续 Service 可通过闭包/构造函数注入 database
	return []application.Service{
		application.NewService(NewGreetService()),
	}
}