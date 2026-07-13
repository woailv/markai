package services

// FileEntry 目录列表中的单项元数据。
type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"` // Unix 秒
}

// ReadFileResult 读取文件结果。
type ReadFileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
}

// WriteFileInput 写文件入参。
// 若目标目录不存在,自动创建父目录。
// BatchID 可选:若非零,写盘前登记原始状态以支持后续撤销。
type WriteFileInput struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	BatchID uint64 `json:"batchId,omitempty"`
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

// MovePathInput 文件/目录移动或重命名入参。
// BatchID 可选:若非零,登记 source 与 destination 的原始状态以支持撤销。
type MovePathInput struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	BatchID     uint64 `json:"batchId,omitempty"`
}