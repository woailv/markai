package conversation

import "time"

// FragmentKind 为片段类别,与 aiproto 中的 CommandKind 大致对齐;
// 差别是 EDIT_FILE 展开成多条 EDIT_BLOCK,PARSE_ERROR 作为一等条目落库。
type FragmentKind string

const (
	FragmentWriteFile            FragmentKind = "WRITE_FILE"
	FragmentEditBlock            FragmentKind = "EDIT_BLOCK"
	FragmentDeleteFile           FragmentKind = "DELETE_FILE"
	FragmentMovePath             FragmentKind = "MOVE_PATH"
	FragmentCreateDirectory      FragmentKind = "CREATE_DIRECTORY"
	FragmentRequestFile          FragmentKind = "REQUEST_FILE"
	FragmentRequestDirectoryList FragmentKind = "REQUEST_DIRECTORY_LIST"
	FragmentParseError           FragmentKind = "PARSE_ERROR"
	// FragmentText 表示不含指令的普通文本段。Before 存原文,
	// 便于前端按 order_index 顺序渲染整条消息而无需依赖 message.content。
	FragmentText FragmentKind = "TEXT"
)

// FragmentStatus 是片段的生命周期状态。
//
//	pending      待应用(默认,尚未落盘)
//	applied      已成功应用
//	match_failed 匹配/执行失败,可编辑后重试
//	ignored      用户主动忽略
//	resolved     只读片段(REQUEST_*)已完成读取
//	parse_error  原文本身无法解析成有效指令
type FragmentStatus string

const (
	StatusPending     FragmentStatus = "pending"
	StatusApplied     FragmentStatus = "applied"
	StatusMatchFailed FragmentStatus = "match_failed"
	StatusIgnored     FragmentStatus = "ignored"
	StatusResolved    FragmentStatus = "resolved"
	StatusParseError  FragmentStatus = "parse_error"
	// StatusText 是 TEXT 片段的终态,不参与任何自动/手动应用。
	StatusText FragmentStatus = "text"
)

// MessageFragment 是 AI 消息里被结构化拆分出的单个修改条目。
// 每条 fragment 对应 UI 上的一张卡片、后端执行流水线上的一个原子动作。
//
// EDIT_BLOCK 展开自单个 EDIT_FILE 标签,同一 EDIT_FILE 的多个块共享:
//   - Path            目标文件
//   - RawStart/RawEnd 该 EDIT_FILE 标签在原文中的字节区间
// 但 BlockIndex 逐块递增,Before/After 分别为该块的 SEARCH / REPLACE。
type MessageFragment struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	MessageID  uint64 `gorm:"not null;index" json:"messageId"`
	OrderIndex int    `gorm:"not null;default:0" json:"orderIndex"`

	Kind        FragmentKind `gorm:"size:32;not null" json:"kind"`
	Path        string       `gorm:"size:1024;not null;default:''" json:"path"`
	Destination string       `gorm:"size:1024;not null;default:''" json:"destination"`

	// RawStart / RawEnd 是对应指令标签(或 EDIT_FILE 父标签)在消息 content
	// 中的字节区间。前端据此把原文切成"文本段 + 指令卡片"。
	RawStart int `gorm:"not null;default:0" json:"rawStart"`
	RawEnd   int `gorm:"not null;default:0" json:"rawEnd"`

	// BlockIndex 仅对 EDIT_BLOCK 有意义:同一 EDIT_FILE 内的相对顺序(从 0 起)。
	BlockIndex int `gorm:"not null;default:0" json:"blockIndex"`

	Before string `gorm:"type:text;not null;default:''" json:"before"`
	After  string `gorm:"type:text;not null;default:''" json:"after"`

	Status      FragmentStatus `gorm:"size:32;not null;default:'pending'" json:"status"`
	MatchReason string         `gorm:"type:text;not null;default:''" json:"matchReason"`

	AppliedAt *time.Time `gorm:"index" json:"appliedAt,omitempty"`
	CreatedAt time.Time  `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time  `gorm:"not null" json:"updatedAt"`
}

func (MessageFragment) TableName() string { return "message_fragments" }
