package services

import (
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// workspaceWatcher 封装 fsnotify,做:
//   - 只监听已注册(根目录 + 前端展开过的目录)的目录,避免递归全量。
//   - 对同一路径的高频事件做 debounce 合并。
//   - 将 fsnotify.Op 归一化为 create/remove/rename/modify 四类,
//     交给上层回调推送到前端。
type workspaceWatcher struct {
	root       string
	debounce   time.Duration
	ignoreSet  map[string]struct{}
	onEvent    func(evType, path string)

	fsw *fsnotify.Watcher

	mu      sync.Mutex
	watched map[string]struct{}
	pending map[string]*pendingEvent
	closed  bool

	doneCh chan struct{}
}

type pendingEvent struct {
	evType string
	timer  *time.Timer
}

// newWorkspaceWatcher 创建并启动一个 watcher。
// 启动时会自动 Watch root。返回时后台 goroutine 已在运行。
func newWorkspaceWatcher(
	root string,
	debounceMs int,
	ignoreSet map[string]struct{},
	onEvent func(evType, path string),
) (*workspaceWatcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	w := &workspaceWatcher{
		root:      root,
		debounce:  time.Duration(debounceMs) * time.Millisecond,
		ignoreSet: ignoreSet,
		onEvent:   onEvent,
		fsw:       fsw,
		watched:   make(map[string]struct{}),
		pending:   make(map[string]*pendingEvent),
		doneCh:    make(chan struct{}),
	}
	if err := w.Watch(root); err != nil {
		_ = fsw.Close()
		return nil, err
	}
	go w.loop()
	return w, nil
}

// Watch 将目录加入监听集合。幂等,已监听则跳过。
// 命中 ignoreSet 的目录静默忽略。
func (w *workspaceWatcher) Watch(dir string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	if _, skip := w.ignoreSet[filepath.Base(dir)]; skip {
		return nil
	}
	if _, ok := w.watched[dir]; ok {
		return nil
	}
	if err := w.fsw.Add(dir); err != nil {
		return err
	}
	w.watched[dir] = struct{}{}
	return nil
}

// Unwatch 从监听集合移除目录。用于目录收起或删除。
func (w *workspaceWatcher) Unwatch(dir string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return
	}
	if _, ok := w.watched[dir]; !ok {
		return
	}
	_ = w.fsw.Remove(dir)
	delete(w.watched, dir)
}

// Close 停止监听并等待后台 goroutine 退出。
func (w *workspaceWatcher) Close() {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	w.closed = true
	// 取消所有 pending timer,避免关闭后仍触发回调
	for _, p := range w.pending {
		if p.timer != nil {
			p.timer.Stop()
		}
	}
	w.pending = nil
	w.mu.Unlock()

	_ = w.fsw.Close()
	<-w.doneCh
}

// loop 主事件循环,直到 fsw.Events 关闭。
func (w *workspaceWatcher) loop() {
	defer close(w.doneCh)
	for {
		select {
		case ev, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			w.handleRawEvent(ev)
		case _, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			// 错误静默丢弃;fsnotify 的错误通道在关闭时会返回 !ok
		}
	}
}

// handleRawEvent 将 fsnotify 原始事件归一化并注册到 debounce 队列。
func (w *workspaceWatcher) handleRawEvent(ev fsnotify.Event) {
	path := filepath.Clean(ev.Name)
	name := filepath.Base(path)
	if _, skip := w.ignoreSet[name]; skip {
		return
	}
	evType := classifyOp(ev.Op)
	if evType == "" {
		return
	}

	// 若一个已监听的目录被删除或重命名,同步清理它的监听
	if evType == WorkspaceChangeRemove || evType == WorkspaceChangeRename {
		w.mu.Lock()
		if _, ok := w.watched[path]; ok {
			_ = w.fsw.Remove(path)
			delete(w.watched, path)
		}
		w.mu.Unlock()
	}

	w.schedule(path, evType)
}

// schedule 把事件放入 debounce 队列;窗口内同一路径的多次事件会被合并,
// 后到事件覆盖前面的类型(以最后一次为准,更贴近最终状态)。
// 特例:若已有 create 且新事件为 modify,保留 create,避免连发。
func (w *workspaceWatcher) schedule(path, evType string) {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	if existing, ok := w.pending[path]; ok {
		if existing.timer != nil {
			existing.timer.Stop()
		}
		// create 优先级最高,不被后续 modify 覆盖
		if !(existing.evType == WorkspaceChangeCreate && evType == WorkspaceChangeModify) {
			existing.evType = evType
		}
	} else {
		w.pending[path] = &pendingEvent{evType: evType}
	}
	p := w.pending[path]
	p.timer = time.AfterFunc(w.debounce, func() {
		w.flush(path)
	})
	w.mu.Unlock()
}

// flush debounce 到期后取出并派发事件。
func (w *workspaceWatcher) flush(path string) {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	p, ok := w.pending[path]
	if !ok {
		w.mu.Unlock()
		return
	}
	delete(w.pending, path)
	evType := p.evType
	cb := w.onEvent
	w.mu.Unlock()

	// 二次确认:remove/rename 事件后如果路径仍然存在,视为 modify
	if evType == WorkspaceChangeRemove || evType == WorkspaceChangeRename {
		if _, err := os.Lstat(path); err == nil {
			evType = WorkspaceChangeModify
		}
	} else if evType == WorkspaceChangeCreate || evType == WorkspaceChangeModify {
		if _, err := os.Lstat(path); err != nil {
			// 事件到达前已被删除,改推 remove
			evType = WorkspaceChangeRemove
		}
	}

	if cb != nil {
		cb(evType, path)
	}
}

// classifyOp 将 fsnotify.Op 位掩码映射到我们的事件类型。
// 优先级:Remove > Rename > Create > Write/Chmod(modify)。
func classifyOp(op fsnotify.Op) string {
	switch {
	case op&fsnotify.Remove != 0:
		return WorkspaceChangeRemove
	case op&fsnotify.Rename != 0:
		return WorkspaceChangeRename
	case op&fsnotify.Create != 0:
		return WorkspaceChangeCreate
	case op&(fsnotify.Write|fsnotify.Chmod) != 0:
		return WorkspaceChangeModify
	}
	return ""
}