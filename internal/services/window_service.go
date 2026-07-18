package services

import (
	"errors"
	"fmt"
	"sync"

	"gorm.io/gorm"

	"prompttool/internal/db"
)

// AlwaysOnTopSetter 将"置顶"能力抽象为一个函数,便于解耦具体窗口实现(Wails)。
// app 层在创建窗口后注入,通常是 window.SetAlwaysOnTop 的闭包。
type AlwaysOnTopSetter func(enabled bool)

// WindowService 管理主窗口的用户可持久化设置。
// 目前实现:置顶状态 (Always On Top)。
type WindowService struct {
	db      *db.DB
	mu      sync.RWMutex
	setter  AlwaysOnTopSetter
	emitter Emitter
	// cached 反映当前应用中的置顶状态,避免频繁查库。
	cached bool
}

// NewWindowService 构造 WindowService。调用方需负责执行 AutoMigrate(&WindowSetting{})。
func NewWindowService(database *db.DB) (*WindowService, error) {
	if database == nil || database.DB == nil {
		return nil, errors.New("window: database is required")
	}
	return &WindowService{db: database}, nil
}

// LoadPersistedAlwaysOnTop 从数据库读取上次保存的置顶状态。
// 记录不存在时返回 false,不视为错误。app 层在创建窗口之前调用,
// 以便用初始状态构造窗口。
func (s *WindowService) LoadPersistedAlwaysOnTop() (bool, error) {
	enabled, err := s.loadBoolSetting(windowSettingKeyAlwaysOnTop)
	if err != nil {
		return false, err
	}
	s.setCached(enabled)
	return enabled, nil
}

// LoadPersistedTrayMode 从数据库读取上次保存的"启动即托盘"偏好。
// 记录不存在时返回 false。app 层在配置 Wails Options 前调用。
func (s *WindowService) LoadPersistedTrayMode() (bool, error) {
	return s.loadBoolSetting(windowSettingKeyTrayMode)
}

// SavePersistedTrayMode 持久化托盘模式偏好,由 TrayService 在
// EnableTray/DisableTray 成功后回调。
func (s *WindowService) SavePersistedTrayMode(enabled bool) error {
	return s.saveBoolSetting(windowSettingKeyTrayMode, enabled)
}

// loadBoolSetting 通用 bool 型 setting 读取。
func (s *WindowService) loadBoolSetting(key string) (bool, error) {
	var row WindowSetting
	err := s.db.DB.Where("key = ?", key).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("window: load %s: %w", key, err)
	}
	return row.Value == "1" || row.Value == "true", nil
}

// saveBoolSetting 通用 bool 型 setting upsert。
func (s *WindowService) saveBoolSetting(key string, enabled bool) error {
	value := "0"
	if enabled {
		value = "1"
	}
	row := WindowSetting{Key: key, Value: value}
	if err := s.db.DB.Save(&row).Error; err != nil {
		return fmt.Errorf("window: save %s: %w", key, err)
	}
	return nil
}

// SetSetter 注入窗口置顶设置器。app 层在创建窗口后调用。
func (s *WindowService) SetSetter(setter AlwaysOnTopSetter) {
	s.mu.Lock()
	s.setter = setter
	s.mu.Unlock()
}

// SetEmitter 注入事件推送能力。
func (s *WindowService) SetEmitter(e Emitter) {
	s.mu.Lock()
	s.emitter = e
	s.mu.Unlock()
}

// GetAlwaysOnTop 返回当前置顶状态(内存缓存,与数据库保持同步)。
func (s *WindowService) GetAlwaysOnTop() (*AlwaysOnTopState, error) {
	s.mu.RLock()
	enabled := s.cached
	s.mu.RUnlock()
	return &AlwaysOnTopState{Enabled: enabled}, nil
}

// SetAlwaysOnTop 设置置顶状态,持久化并应用到窗口。
// 成功后广播 WindowEventAlwaysOnTopChanged。
func (s *WindowService) SetAlwaysOnTop(in SetAlwaysOnTopInput) (*AlwaysOnTopState, error) {
	if err := s.persistAlwaysOnTop(in.Enabled); err != nil {
		return nil, err
	}
	s.applyAlwaysOnTop(in.Enabled)
	s.setCached(in.Enabled)
	s.emitAlwaysOnTopChanged(in.Enabled)
	return &AlwaysOnTopState{Enabled: in.Enabled}, nil
}

// ToggleAlwaysOnTop 翻转当前置顶状态。
func (s *WindowService) ToggleAlwaysOnTop() (*AlwaysOnTopState, error) {
	s.mu.RLock()
	next := !s.cached
	s.mu.RUnlock()
	return s.SetAlwaysOnTop(SetAlwaysOnTopInput{Enabled: next})
}

// persistAlwaysOnTop upsert 一条 WindowSetting 记录。
func (s *WindowService) persistAlwaysOnTop(enabled bool) error {
	return s.saveBoolSetting(windowSettingKeyAlwaysOnTop, enabled)
}

// applyAlwaysOnTop 通过注入的 setter 应用到窗口。setter 未注入时静默。
func (s *WindowService) applyAlwaysOnTop(enabled bool) {
	s.mu.RLock()
	setter := s.setter
	s.mu.RUnlock()
	if setter == nil {
		return
	}
	setter(enabled)
}

// emitAlwaysOnTopChanged 广播变更事件。emitter 未注入时静默。
func (s *WindowService) emitAlwaysOnTopChanged(enabled bool) {
	s.mu.RLock()
	e := s.emitter
	s.mu.RUnlock()
	if e == nil {
		return
	}
	e.EmitEvent(WindowEventAlwaysOnTopChanged, AlwaysOnTopState{Enabled: enabled})
}

// setCached 线程安全地更新内存缓存。
func (s *WindowService) setCached(enabled bool) {
	s.mu.Lock()
	s.cached = enabled
	s.mu.Unlock()
}