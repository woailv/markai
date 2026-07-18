package services

// 事件与存储键。
const (
	// WindowEventAlwaysOnTopChanged 前端可订阅的置顶状态变更事件。
	WindowEventAlwaysOnTopChanged = "window:alwaysOnTop:changed"

	// windowSettingKeyAlwaysOnTop 持久化置顶状态所用的 key。
	windowSettingKeyAlwaysOnTop = "always_on_top"

	// windowSettingKeyTrayMode 持久化"启动即托盘模式"偏好所用的 key。
	windowSettingKeyTrayMode = "tray_mode"
)

// WindowSetting 以 key-value 方式持久化窗口相关设置。
// 使用通用表以便后续新增窗口设置项(如位置、透明度)时无需再建表。
type WindowSetting struct {
	Key   string `gorm:"primaryKey;size:64;not null" json:"key"`
	Value string `gorm:"size:256;not null" json:"value"`
}

// TableName 显式指定表名。
func (WindowSetting) TableName() string { return "window_settings" }

// SetAlwaysOnTopInput 前端调用 SetAlwaysOnTop 的入参。
type SetAlwaysOnTopInput struct {
	Enabled bool `json:"enabled"`
}

// AlwaysOnTopState 返回给前端的置顶状态。
type AlwaysOnTopState struct {
	Enabled bool `json:"enabled"`
}