package services

import "time"

// RecentItem 记录用户最近打开的目录或文件。
type RecentItem struct {
	ID       uint      `gorm:"primaryKey" json:"id"`
	Path     string    `gorm:"uniqueIndex;size:1024;not null" json:"path"`
	Kind     string    `gorm:"size:16;not null" json:"kind"` // "dir" | "file"
	OpenedAt time.Time `gorm:"index;not null" json:"openedAt"`
}

// TableName 显式指定表名,避免 gorm 复数化带来的歧义。
func (RecentItem) TableName() string { return "recent_items" }

// 常量:kind 取值与事件名、上限。
const (
	RecentKindDir  = "dir"
	RecentKindFile = "file"

	// RecentMaxItems 最近打开的最大条目数;超出时按 OpenedAt 升序删除最老。
	RecentMaxItems = 30

	// RecentEventChanged 前端可订阅的变更事件名。
	RecentEventChanged = "recent:changed"
)

// ListRecentInput 前端调用 List 的入参。
type ListRecentInput struct {
}

// RemoveRecentInput 前端调用 Remove 的入参。
type RemoveRecentInput struct {
	ID uint `json:"id"`
}

// ClearRecentInput 前端调用 Clear 的入参。
// 当前模型不含 pinned 字段,该参数为将来预留;若为 true 目前不清空(无 pinned 概念时等同 false)。
type ClearRecentInput struct {
}
