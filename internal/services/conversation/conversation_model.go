package conversation

import "time"

// Conversation 会话主体。
// 标题默认由首条用户消息摘要生成,可被用户覆盖(TitleOverridden=true)。
// Pinned=true 表示置顶,列表中排在最前。
type Conversation struct {
	ID              uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Title           string    `gorm:"size:256;not null;default:''" json:"title"`
	TitleOverridden bool      `gorm:"not null;default:false" json:"titleOverridden"`
	Pinned          bool      `gorm:"not null;default:false;index" json:"pinned"`
	MessageCount    int       `gorm:"not null;default:0" json:"messageCount"`
	CreatedAt       time.Time `gorm:"not null;index" json:"createdAt"`
	UpdatedAt       time.Time `gorm:"not null;index" json:"updatedAt"`
}

func (Conversation) TableName() string { return "conversations" }

// Message 会话中的一条消息。
// Role: "user" | "assistant"
// BatchID 非零表示该 AI 消息触发了一次文件修改批次,用于关联快照。
type Message struct {
	ID             uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	ConversationID uint64    `gorm:"not null;index:idx_msg_conv_created" json:"conversationId"`
	Role           string    `gorm:"size:16;not null" json:"role"`
	Content        string    `gorm:"type:text;not null" json:"content"`
	BatchID        uint64    `gorm:"not null;default:0;index" json:"batchId"`
	CreatedAt      time.Time `gorm:"not null;index:idx_msg_conv_created" json:"createdAt"`
	UpdatedAt      time.Time `gorm:"not null" json:"updatedAt"`
}

func (Message) TableName() string { return "messages" }

// ConversationTemplate 会话与 PromptTemplate 的多对多关联表。
// 用于持久化某会话当前启用的模板集合,刷新后可直接恢复。
type ConversationTemplate struct {
	ID             uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	ConversationID uint64    `gorm:"not null;uniqueIndex:idx_conv_tpl_unique,priority:1;index" json:"conversationId"`
	TemplateID     uint      `gorm:"not null;uniqueIndex:idx_conv_tpl_unique,priority:2" json:"templateId"`
	CreatedAt      time.Time `gorm:"not null" json:"createdAt"`
}

func (ConversationTemplate) TableName() string { return "conversation_templates" }
