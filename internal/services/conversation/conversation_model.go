package conversation

// ConversationSummary 会话列表项。
type ConversationSummary struct {
	ID              uint64 `json:"id"`
	Title           string `json:"title"`
	TitleOverridden bool   `json:"titleOverridden"`
	Pinned          bool   `json:"pinned"`
	MessageCount    int    `json:"messageCount"`
	TemplateIDs     []uint `json:"templateIds"` // 该会话关联的模板集合
	CreatedAt       string `json:"createdAt"`   // RFC3339
	UpdatedAt       string `json:"updatedAt"`
}

// SetPinnedInput 置顶/取消置顶入参。
type SetPinnedInput struct {
	ConversationID uint64 `json:"conversationId"`
	Pinned         bool   `json:"pinned"`
}

// MessageDTO 单条消息的传输结构。
type MessageDTO struct {
	ID             uint64 `json:"id"`
	ConversationID uint64 `json:"conversationId"`
	Role           string `json:"role"`
	Content        string `json:"content"`
	BatchID        uint64 `json:"batchId"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// ConversationDetail 会话详情:包含元数据 + 消息序列。
type ConversationDetail struct {
	Conversation ConversationSummary `json:"conversation"`
	Messages     []MessageDTO        `json:"messages"`
}

// AppendMessageInput 追加消息入参。
// 若 ConversationID 为 0,后端会自动创建新会话并返回新 id。
type AppendMessageInput struct {
	ConversationID uint64 `json:"conversationId"`
	Role           string `json:"role"` // "user" | "assistant"
	Content        string `json:"content"`
	BatchID        uint64 `json:"batchId"` // 可选:关联的快照批次
}

// AppendMessageResult 追加消息结果。
type AppendMessageResult struct {
	ConversationID uint64     `json:"conversationId"`
	Message        MessageDTO `json:"message"`
	CreatedNew     bool       `json:"createdNew"` // 是否为本次调用新建的会话
}

// UpdateMessageInput 修改消息正文入参。
type UpdateMessageInput struct {
	MessageID uint64 `json:"messageId"`
	Content   string `json:"content"`
}

// RenameConversationInput 重命名会话入参。
type RenameConversationInput struct {
	ConversationID uint64 `json:"conversationId"`
	Title          string `json:"title"`
}

// SetTemplatesInput 保存会话启用的模板集合。
type SetTemplatesInput struct {
	ConversationID uint64 `json:"conversationId"`
	TemplateIDs    []uint `json:"templateIds"`
}
