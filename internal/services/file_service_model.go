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
type WriteFileInput struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// WriteFileResult 写文件结果,包含 git 风格的 diff 提示。
// Created=true 表示新建文件(展示"创建文件"),否则展示"编辑文件"。
type WriteFileResult struct {
	Path    string `json:"path"`
	Created bool   `json:"created"`
	Diff    string `json:"diff"`
}

// MovePathInput 文件/目录移动或重命名入参。
type MovePathInput struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
}