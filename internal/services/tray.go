package services

import (
	"errors"
	"runtime"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
)

// TrayService 负责创建并维护系统托盘图标与菜单。
//
// 从本版本起,托盘不再是"可切换的运行模式",而是应用的常驻入口:
//   - 应用启动时由 app 层调用一次 Install,创建托盘图标 / 菜单;
//   - 窗口关闭按钮被拦截为"隐藏",保证再次通过托盘唤出;
//   - 前端仍可通过 ShowWindow 主动唤出主窗口。
//
// TrayService 不直接依赖 window 包,主窗口通过 SetWindow 由 app 层注入,
// 避免 services -> window 的循环依赖。
type TrayService struct {
	mu sync.Mutex

	app      *application.App
	window   *application.WebviewWindow
	tray     *application.SystemTray
	menu     *application.Menu
	unhook   func()
	iconData []byte
}

// NewTrayService 创建 TrayService。app 与 window 依赖需在 app 层注入。
func NewTrayService() *TrayService {
	return &TrayService{}
}

// SetApp 由 app 层注入 Wails application 引用。
func (s *TrayService) SetApp(app *application.App) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.app = app
}

// SetWindow 由 app 层注入主窗口引用。
func (s *TrayService) SetWindow(win *application.WebviewWindow) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.window = win
}

// SetIcon 允许 app 层注入托盘图标数据(PNG 字节)。
// 非 darwin 平台使用普通图标,darwin 使用 template 图标。
// 未调用时使用 Wails 内置默认图标。
func (s *TrayService) SetIcon(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.iconData = data
}

// Install 创建托盘图标与菜单,并注册窗口关闭拦截钩子。
// 由 app 层在启动阶段调用一次;幂等:重复调用不会重复创建。
func (s *TrayService) Install() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.app == nil {
		return errors.New("tray: application not initialized")
	}
	if s.window == nil {
		return errors.New("tray: main window not initialized")
	}
	if s.tray != nil {
		return nil
	}

	tray := s.app.SystemTray.New()

	if runtime.GOOS == "darwin" {
		if len(s.iconData) > 0 {
			tray.SetTemplateIcon(s.iconData)
		} else {
			tray.SetTemplateIcon(icons.SystrayMacTemplate)
		}
	} else if len(s.iconData) > 0 {
		tray.SetIcon(s.iconData)
	}

	menu := s.app.NewMenu()
	menu.Add("显示窗口").OnClick(func(ctx *application.Context) {
		s.showWindowLocked()
	})
	menu.AddSeparator()
	menu.Add("退出").OnClick(func(ctx *application.Context) {
		s.app.Quit()
	})
	tray.SetMenu(menu)

	// 拦截关闭:关闭按钮转为隐藏窗口,保持后台运行。
	s.unhook = s.window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		s.window.Hide()
		e.Cancel()
	})

	s.tray = tray
	s.menu = menu
	return nil
}

// ShowWindow 主动显示并聚焦主窗口(供前端 / 托盘菜单唤出窗口)。
func (s *TrayService) ShowWindow() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.window == nil {
		return errors.New("tray: main window not initialized")
	}
	s.showWindowLocked()
	return nil
}

// showWindowLocked 在持锁状态下显示窗口。
// 托盘只是图标入口,窗口显示按主 UI 的常规行为处理,不做位置吸附。
func (s *TrayService) showWindowLocked() {
	if s.window == nil {
		return
	}
	s.window.Show()
	s.window.Focus()
}