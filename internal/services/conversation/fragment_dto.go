package conversation

// MessageFragmentDTO 单个修改片段的传输结构。
type MessageFragmentDTO struct {
	ID          uint64 `json:"id"`
	MessageID   uint64 `json:"messageId"`
	OrderIndex  int    `json:"orderIndex"`
	Kind        string `json:"kind"`
	Path        string `json:"path"`
	Destination string `json:"destination"`
	RawStart    int    `json:"rawStart"`
	RawEnd      int    `json:"rawEnd"`
	BlockIndex  int    `json:"blockIndex"`
	Before      string `json:"before"`
	After       string `json:"after"`
	Status      string `json:"status"`
	MatchReason string `json:"matchReason"`
	AppliedAt   string `json:"appliedAt,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// UpdateFragmentInput 修改片段的编辑内容/目标位置入参。
// 未设置的字段(nil 或空)不被覆盖。为了保持简单,这里区分"未提供"用零值 + 字段:
// 使用指针可以避免歧义。
type UpdateFragmentInput struct {
	FragmentID  uint64  `json:"fragmentId"`
	Path        *string `json:"path,omitempty"`
	Destination *string `json:"destination,omitempty"`
	Before      *string `json:"before,omitempty"`
	After       *string `json:"after,omitempty"`
}

// ApplyFragmentsInput 批量应用入参。若 FragmentIDs 为空,则对该消息所有
// 可应用(pending / match_failed)的片段依次执行。
type ApplyFragmentsInput struct {
	MessageID   uint64   `json:"messageId"`
	FragmentIDs []uint64 `json:"fragmentIds,omitempty"`
}

// ApplyFragmentsResult 返回本次触发后所有相关 fragment 的最新态,以便前端一次性合并。
type ApplyFragmentsResult struct {
	Fragments []MessageFragmentDTO `json:"fragments"`
}

// SetFragmentStatusInput 设置片段状态,当前仅支持 ignored / pending 两态切换。
type SetFragmentStatusInput struct {
	FragmentID uint64 `json:"fragmentId"`
	Status     string `json:"status"` // "ignored" | "pending"
}
