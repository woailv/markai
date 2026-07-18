package services

import (
	"errors"
	"runtime"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
)

// TrayService 提供给前端主动切换到"系统托盘运行"模式的能力。
//
// 前端调用 EnableTray 后:
//   - 主窗口被隐藏(而非关闭);
//   - 在系统托盘创建图标与菜单(Show / Quit);
//   - 窗口关闭事件被拦截为"隐藏",保证再次通过托盘唤出。
//
// DisableTray 会移除托盘并恢复窗口的默认关闭行为。
//
// TrayService 不直接依赖 window 包,主窗口通过 SetWindow 由 app 层注入,
// 避免 services -> window 的循环依赖。
// TrayModePersister 持久化"当前是否处于托盘模式"偏好的回调。
// 由 app 层注入,通常是 WindowService.SavePersistedTrayMode 的闭包,
// 避免 TrayService 反向依赖 WindowService。
type TrayModePersister func(enabled bool) error

type TrayService struct {
	mu sync.Mutex

	app       *application.App
	window    *application.WebviewWindow
	tray      *application.SystemTray
	menu      *application.Menu
	unhook    func()
	iconData  []byte
	persister TrayModePersister
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

// SetPersister 注入托盘模式持久化回调。
func (s *TrayService) SetPersister(p TrayModePersister) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.persister = p
}

// EnableTray 启用托盘模式:隐藏主窗口并创建托盘图标与菜单。
// 幂等:重复调用不会重复创建。
func (s *TrayService) EnableTray() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.app == nil {
		return errors.New("tray: application not initialized")
	}
	if s.window == nil {
		return errors.New("tray: main window not initialized")
	}
	if s.tray != nil {
		// 已启用,只需确保窗口隐藏。
		s.window.Hide()
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

	// 托盘模式仅承担"后台运行 + 托盘入口"职责,不改变主窗口 UI 形态,
	// 也不再把窗口锚定到屏幕右下角,窗口的位置由用户自己控制。
	s.window.Hide()
	s.persistLocked(true)
	return nil
}

// DisableTray 关闭托盘模式,移除托盘图标并恢复窗口关闭默认行为,
// 同时将主窗口重新显示出来。
// 幂等:未启用时直接返回。
func (s *TrayService) DisableTray() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.tray == nil {
		return nil
	}

	if s.unhook != nil {
		s.unhook()
		s.unhook = nil
	}

	s.tray.Destroy()
	s.tray = nil
	s.menu = nil

	if s.window != nil {
		s.window.Show()
		s.window.Focus()
	}
	s.persistLocked(false)
	return nil
}

// persistLocked 在持锁状态下写入托盘模式偏好。失败静默(不阻塞主流程),
// 因为持久化仅用于下次启动恢复,当次运行时状态已通过其他路径生效。
func (s *TrayService) persistLocked(enabled bool) {
	if s.persister == nil {
		return
	}
	_ = s.persister(enabled)
}

// ShowWindow 主动显示并聚焦主窗口(供前端在托盘模式下唤出窗口)。
func (s *TrayService) ShowWindow() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.window == nil {
		return errors.New("tray: main window not initialized")
	}
	s.showWindowLocked()
	return nil
}

// IsTrayActive 返回当前是否处于托盘模式。
func (s *TrayService) IsTrayActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tray != nil
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