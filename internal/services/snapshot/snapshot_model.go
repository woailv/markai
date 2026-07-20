package snapshot

// BeginBatchInput 开启快照批次入参。
// MessageID 为触发该批次的 AI 消息 id;可为 0(先执行、后落库),之后再 Bind。
type BeginBatchInput struct {
	ConversationID uint64 `json:"conversationId"`
	MessageID      uint64 `json:"messageId"`
}

// BeginBatchResult 开启批次结果。
type BeginBatchResult struct {
	BatchID uint64 `json:"batchId"`
}

// BindBatchInput 将已开启的批次绑定到最终落库的 AI 消息 id。
type BindBatchInput struct {
	BatchID   uint64 `json:"batchId"`
	MessageID uint64 `json:"messageId"`
}

// BatchStatus 批次状态,用于前端渲染撤销入口。
type BatchStatus struct {
	BatchID   uint64 `json:"batchId"`
	MessageID uint64 `json:"messageId"`
	FileCount int    `json:"fileCount"`
	CreatedAt string `json:"createdAt"`
	UndoneAt  string `json:"undoneAt,omitempty"` // 非空表示已撤销
	// StaleWarning=true 表示批次内某些文件在此后又被其它批次修改过,
	// 撤销时会覆盖那些较新的修改。
	StaleWarning bool `json:"staleWarning"`
}

// UndoBatchResult 撤销结果概览。
type UndoBatchResult struct {
	BatchID       uint64   `json:"batchId"`
	RestoredPaths []string `json:"restoredPaths"`
	Warnings      []string `json:"warnings"`
}
