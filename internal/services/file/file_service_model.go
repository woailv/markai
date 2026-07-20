package file

// FileEntry 目录列表中的单项元数据。
type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"` // Unix 秒
}

// ReadFileResult 读取文件结果。ModTime 为 Unix 秒,用于后续写入时的 data race 检测。
type ReadFileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"`
}

// WriteFileInput 写文件入参。
// 若目标目录不存在,自动创建父目录。
// BatchID 可选:若非零,写盘前登记原始状态以支持后续撤销。
// ExpectedModTime 可选(Unix 秒):若非零且目标文件已存在,写入前会比对磁盘上的 mtime,
// 不一致则拒绝写入(data race 保护)。新建文件场景该字段被忽略。
type WriteFileInput struct {
	Path            string `json:"path"`
	Content         string `json:"content"`
	BatchID         uint64 `json:"batchId,omitempty"`
	ExpectedModTime int64  `json:"expectedModTime,omitempty"`
}

// DeleteInput 删除入参。BatchID 语义同 WriteFileInput。
type DeleteInput struct {
	Path    string `json:"path"`
	BatchID uint64 `json:"batchId,omitempty"`
}

// CreateDirectoryInput 创建目录入参。BatchID 语义同 WriteFileInput。
type CreateDirectoryInput struct {
	Path    string `json:"path"`
	BatchID uint64 `json:"batchId,omitempty"`
}

// WriteFileResult 写文件结果,包含 git 风格的 diff 提示。
// Created=true 表示新建文件(展示"创建文件"),否则展示"编辑文件"。
type WriteFileResult struct {
	Path    string `json:"path"`
	Created bool   `json:"created"`
	Diff    string `json:"diff"`
}

// GenerateTreeInput 生成目录树入参。
type GenerateTreeInput struct {
	Paths    []string `json:"paths"`
	MaxDepth int      `json:"maxDepth"` // 最大深度限制，防止大型目录导致无限递归
}

// GenerateTreeResult 生成目录树出参。
type GenerateTreeResult struct {
	TreeText string `json:"treeText"`
}

// MovePathInput 文件/目录移动或重命名入参。
// BatchID 可选:若非零,登记 source 与 destination 的原始状态以支持撤销。
type MovePathInput struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	BatchID     uint64 `json:"batchId,omitempty"`
}

// RenameInput 同级重命名入参。NewName 只能是纯文件名,不能包含分隔符。
type RenameInput struct {
	Path    string `json:"path"`
	NewName string `json:"newName"`
	BatchID uint64 `json:"batchId,omitempty"`
}

// RenameResult 重命名结果。Renamed=false 表示新旧同名,已静默跳过。
type RenameResult struct {
	Path    string `json:"path"`
	OldPath string `json:"oldPath"`
	Renamed bool   `json:"renamed"`
}

// CopyToWorkspaceInput 外部文件导入工作区入参。
// Cut=true 表示剪切语义:复制成功后删除源。
type CopyToWorkspaceInput struct {
	SrcPaths     []string `json:"srcPaths"`
	WorkspaceDir string   `json:"workspaceDir"`
	Cut          bool     `json:"cut"`
}

// WriteBytesInput 将字节流写入工作区入参(用于粘贴场景)。
type WriteBytesInput struct {
	FileName     string `json:"fileName"`
	Data         []byte `json:"data"`
	WorkspaceDir string `json:"workspaceDir"`
}
