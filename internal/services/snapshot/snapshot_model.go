package snapshot

import "time"

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
