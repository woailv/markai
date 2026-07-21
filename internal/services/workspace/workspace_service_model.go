package workspace

// WorkspaceEntry 目录树中的单项元数据。
// 字段设计与 FileEntry 保持一致的命名风格,并增加 IsHidden / IsSymlink
// 供前端做视觉区分。
type WorkspaceEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Parent    string `json:"parent"`
	IsDir     bool   `json:"isDir"`
	IsHidden  bool   `json:"isHidden"`
	IsSymlink bool   `json:"isSymlink"`
	Size      int64  `json:"size"`
	ModTime   int64  `json:"modTime"` // Unix 秒
}

// WorkspaceRootInfo 工作区根目录状态。
type WorkspaceRootInfo struct {
	Root     string `json:"root"`
	Exists   bool   `json:"exists"`
	Watching bool   `json:"watching"`
	Degraded bool   `json:"degraded"` // fsnotify 不可用,已降级为轮询
	Reason   string `json:"reason,omitempty"`
}

// ListWorkspaceInput 列出目录一层内容的入参。
// Path 为空时使用当前根目录;非空时必须位于根目录之内。
type ListWorkspaceInput struct {
	Path          string `json:"path,omitempty"`
	IncludeHidden bool   `json:"includeHidden,omitempty"`
}

// ListAllWorkspaceInput 一次性拉取整棵目录树的入参。
// 命中 IgnoreDirs 的目录及其子树整体跳过。
type ListAllWorkspaceInput struct {
	IncludeHidden bool `json:"includeHidden,omitempty"`
}

// SetWorkspaceRootInput 设置根目录入参。
type SetWorkspaceRootInput struct {
	Root string `json:"root"`
}

// 变更事件类型常量(推送给前端使用)。
const (
	WorkspaceChangeCreate = "create"
	WorkspaceChangeRemove = "remove"
	WorkspaceChangeRename = "rename"
	WorkspaceChangeModify = "modify"
)

// WorkspaceChangeEvent 推送到前端的文件系统变更事件。
// EventName 见 WorkspaceEventChanged。
type WorkspaceChangeEvent struct {
	Type   string          `json:"type"`
	Path   string          `json:"path"`
	Parent string          `json:"parent"`
	Entry  *WorkspaceEntry `json:"entry,omitempty"` // 新增/修改时携带最新元数据
}

// WorkspaceEventChanged 变更事件名,前端订阅使用。
const WorkspaceEventChanged = "workspace:changed"
