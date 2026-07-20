package prompt

import "time"

// PromptTemplate 提示词模板持久化模型。
type PromptTemplate struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Title     string    `gorm:"size:255;not null;index" json:"title"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TableName 指定表名。
func (PromptTemplate) TableName() string {
	return "prompt_templates"
}
