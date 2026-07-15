package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"prompttool/internal/config"
)

// Emitter 抽象事件推送能力,便于解耦 Wails application 依赖与测试。
type Emitter interface {
	EmitEvent(name string, data any)
}

// WorkspaceService 负责维护工作区目录树的元数据查询与文件系统监听。
// 对外暴露给前端的方法在 Wails 端会自动生成 TS 绑定,
// 因此方法签名应以 JSON 友好类型为主。
type WorkspaceService struct {
	mu         sync.RWMutex
	root       string
	ignoreSet  map[string]struct{}
	emitter    Emitter
	watcher    *workspaceWatcher
	debounceMs int
	recent     *RecentService
}

// NewWorkspaceService 使用默认配置构造。emitter 可后续通过 SetEmitter 注入。
func NewWorkspaceService(cfg config.WorkspaceConfig) *WorkspaceService {
	svc := &WorkspaceService{
		debounceMs: cfg.DebounceMillis,
		ignoreSet:  make(map[string]struct{}, len(cfg.IgnoreDirs)),
	}
	if svc.debounceMs <= 0 {
		svc.debounceMs = 150
	}
	for _, d := range cfg.IgnoreDirs {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		svc.ignoreSet[d] = struct{}{}
	}
	if cfg.Root != "" {
		if abs, err := filepath.Abs(cfg.Root); err == nil {
			svc.root = filepath.Clean(abs)
		}
	}
	return svc
}

// SetEmitter 由 app 层在构造完 Wails application 后注入,
// 供 watcher 推送变更事件使用。
func (s *WorkspaceService) SetEmitter(e Emitter) {
	s.mu.Lock()
	s.emitter = e
	s.mu.Unlock()
}

// setRecent 注入 RecentService,使切换根目录时自动记录一条"最近打开"。
// 允许传入 nil 表示不启用该联动。
func (s *WorkspaceService) setRecent(r *RecentService) {
	s.mu.Lock()
	s.recent = r
	s.mu.Unlock()
}

// Start 启动文件系统监听。若 root 未设置或不存在,返回状态但不报错(降级)。
func (s *WorkspaceService) Start() (*WorkspaceRootInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.startLocked()
}

func (s *WorkspaceService) startLocked() (*WorkspaceRootInfo, error) {
	info := &WorkspaceRootInfo{Root: s.root}
	if s.root == "" {
		info.Reason = "workspace root not set"
		return info, nil
	}
	st, err := os.Stat(s.root)
	if err != nil {
		info.Reason = fmt.Sprintf("stat root: %v", err)
		return info, nil
	}
	if !st.IsDir() {
		info.Reason = "root is not a directory"
		return info, nil
	}
	info.Exists = true

	// 关掉旧 watcher 再启新的
	if s.watcher != nil {
		s.watcher.Close()
		s.watcher = nil
	}
	w, err := newWorkspaceWatcher(s.root, s.debounceMs, s.ignoreSet, s.emitAndBuildEntry)
	if err != nil {
		info.Degraded = true
		info.Reason = fmt.Sprintf("fsnotify unavailable: %v", err)
		return info, nil
	}
	s.watcher = w
	info.Watching = true
	return info, nil
}

// Stop 停止监听。多次调用安全。
func (s *WorkspaceService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.watcher != nil {
		s.watcher.Close()
		s.watcher = nil
	}
}

// GetRoot 返回当前根目录状态。
func (s *WorkspaceService) GetRoot() *WorkspaceRootInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	info := &WorkspaceRootInfo{Root: s.root}
	if s.root == "" {
		return info
	}
	st, err := os.Stat(s.root)
	if err == nil && st.IsDir() {
		info.Exists = true
	}
	info.Watching = s.watcher != nil
	return info
}

// SetRoot 切换根目录,重启监听。
func (s *WorkspaceService) SetRoot(in SetWorkspaceRootInput) (*WorkspaceRootInfo, error) {
	root := strings.TrimSpace(in.Root)
	if root == "" {
		return nil, errors.New("workspace: root required")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("workspace: abs %q: %w", root, err)
	}
	abs = filepath.Clean(abs)
	st, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("workspace: stat %q: %w", abs, err)
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("workspace: %q is not a directory", abs)
	}
	s.mu.Lock()
	s.root = abs
	recent := s.recent
	info, startErr := s.startLocked()
	s.mu.Unlock()
	if startErr == nil && recent != nil {
		// 记录失败不影响主流程,仅当作降级处理。
		_, _ = recent.Record(abs)
	}
	return info, startErr
}

// List 列出指定目录下一层子项。Path 为空表示根目录。
// 若目录被展开,会自动将其加入监听集合。
func (s *WorkspaceService) List(in ListWorkspaceInput) ([]WorkspaceEntry, error) {
	s.mu.RLock()
	root := s.root
	watcher := s.watcher
	s.mu.RUnlock()

	if root == "" {
		return nil, errors.New("workspace: root not set")
	}

	target := strings.TrimSpace(in.Path)
	if target == "" {
		target = root
	} else {
		abs, err := filepath.Abs(target)
		if err != nil {
			return nil, fmt.Errorf("workspace: abs %q: %w", target, err)
		}
		target = filepath.Clean(abs)
		if err := ensureUnderRoot(root, target); err != nil {
			return nil, err
		}
	}

	entries, err := listDirEntries(target, in.IncludeHidden, s.ignoreSet)
	if err != nil {
		return nil, err
	}

	if watcher != nil {
		// 展开时动态加入监听;失败静默(不影响返回)。
		_ = watcher.Watch(target)
	}
	return entries, nil
}

// Refresh 强制重新读取指定目录一层内容,不区分是否已缓存(前端负责缓存)。
// 相当于 List 的语义快捷方式,便于前端右键"刷新"直接调用。
func (s *WorkspaceService) Refresh(in ListWorkspaceInput) ([]WorkspaceEntry, error) {
	return s.List(in)
}

// emitAndBuildEntry watcher 回调:根据变更类型构造事件并推送。
// path 为受影响的绝对路径,parent 为其所在目录。
func (s *WorkspaceService) emitAndBuildEntry(evType, path string) {
	s.mu.RLock()
	emitter := s.emitter
	root := s.root
	s.mu.RUnlock()
	if emitter == nil || root == "" {
		return
	}
	if err := ensureUnderRoot(root, path); err != nil {
		return
	}
	parent := filepath.Dir(path)
	evt := WorkspaceChangeEvent{
		Type:   evType,
		Path:   path,
		Parent: parent,
	}
	if evType == WorkspaceChangeCreate || evType == WorkspaceChangeModify {
		if entry, err := statEntry(path); err == nil {
			evt.Entry = entry
		}
	}
	emitter.EmitEvent(WorkspaceEventChanged, evt)
}

// ---------- 辅助函数 ----------

// ensureUnderRoot 校验目标路径必须位于 root 之内(或等于 root),
// 防止通过 ../ 越权访问。root、target 都应是 Clean 后的绝对路径。
func ensureUnderRoot(root, target string) error {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return fmt.Errorf("workspace: rel %q: %w", target, err)
	}
	rel = filepath.ToSlash(rel)
	if rel == ".." || strings.HasPrefix(rel, "../") {
		return fmt.Errorf("workspace: path %q escapes root %q", target, root)
	}
	return nil
}

// listDirEntries 读取目录一层内容,按目录优先 + 名称升序排序。
// includeHidden=false 时过滤掉隐藏项;命中 ignoreSet 的目录始终过滤。
func listDirEntries(dir string, includeHidden bool, ignoreSet map[string]struct{}) ([]WorkspaceEntry, error) {
	raw, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("workspace: list %q: %w", dir, err)
	}
	result := make([]WorkspaceEntry, 0, len(raw))
	for _, e := range raw {
		name := e.Name()
		full := filepath.Join(dir, name)
		if e.IsDir() {
			if _, skip := ignoreSet[name]; skip {
				continue
			}
		}
		hidden := isHiddenPath(full, name)
		if hidden && !includeHidden {
			continue
		}
		info, infoErr := e.Info()
		if infoErr != nil {
			// 单项失败不阻断整体列表
			continue
		}
		isSymlink := info.Mode()&os.ModeSymlink != 0
		result = append(result, WorkspaceEntry{
			Name:      name,
			Path:      full,
			Parent:    dir,
			IsDir:     e.IsDir(),
			IsHidden:  hidden,
			IsSymlink: isSymlink,
			Size:      info.Size(),
			ModTime:   info.ModTime().Unix(),
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// statEntry 为单个路径构造 WorkspaceEntry;主要供变更事件回调使用。
func statEntry(path string) (*WorkspaceEntry, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	name := filepath.Base(path)
	isSymlink := info.Mode()&os.ModeSymlink != 0
	isDir := info.IsDir()
	if isSymlink {
		// 解析符号链接目标以判定 IsDir
		if target, terr := os.Stat(path); terr == nil {
			isDir = target.IsDir()
		}
	}
	return &WorkspaceEntry{
		Name:      name,
		Path:      path,
		Parent:    filepath.Dir(path),
		IsDir:     isDir,
		IsHidden:  isHiddenPath(path, name),
		IsSymlink: isSymlink,
		Size:      info.Size(),
		ModTime:   info.ModTime().Unix(),
	}, nil
}
