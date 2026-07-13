package db

import "time"

// Conversation 会话主体。
// 标题默认由首条用户消息摘要生成,可被用户覆盖(TitleOverridden=true)。
type Conversation struct {
	ID              uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Title           string    `gorm:"size:256;not null;default:''" json:"title"`
	TitleOverridden bool      `gorm:"not null;default:false" json:"titleOverridden"`
	MessageCount    int       `gorm:"not null;default:0" json:"messageCount"`
	CreatedAt       time.Time `gorm:"not null;index" json:"createdAt"`
	UpdatedAt       time.Time `gorm:"not null;index" json:"updatedAt"`
}

// TableName 显式表名,避免复数化差异。
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

// SnapshotBatch 一次 AI 消息触发的文件修改批次。
// UndoneAt 非零表示已被撤销,该批次进入终态。
type SnapshotBatch struct {
	ID             uint64     `gorm:"primaryKey;autoIncrement" json:"id"`
	ConversationID uint64     `gorm:"not null;index" json:"conversationId"`
	MessageID      uint64     `gorm:"not null;index" json:"messageId"`
	CreatedAt      time.Time  `gorm:"not null;index" json:"createdAt"`
	UndoneAt       *time.Time `gorm:"index" json:"undoneAt,omitempty"`
}

func (SnapshotBatch) TableName() string { return "snapshot_batches" }

// FileSnapshot 单个文件在批次开始前的快照。
// Existed=false 表示该文件在动作前不存在(撤销时需要删除)。
// Order 用于保留批次内多次修改同一路径时的顺序,还原时按逆序应用。
type FileSnapshot struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	BatchID   uint64    `gorm:"not null;index:idx_snap_batch_order" json:"batchId"`
	Path      string    `gorm:"size:1024;not null" json:"path"`
	Existed   bool      `gorm:"not null" json:"existed"`
	IsDir     bool      `gorm:"not null;default:false" json:"isDir"`
	Content   []byte    `gorm:"type:blob" json:"-"`
	Order     int       `gorm:"not null;index:idx_snap_batch_order" json:"order"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`
}

func (FileSnapshot) TableName() string { return "file_snapshots" }