package prompt

import (
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"prompttool/internal/db"
)

// PromptTemplateService 提供提示词模板的增删改查能力,暴露给前端调用。
type PromptTemplateService struct {
	db *db.DB
}

// NewPromptTemplateService 构造函数,注入数据库依赖并执行迁移。
func NewPromptTemplateService(database *db.DB) (*PromptTemplateService, error) {
	if database == nil {
		return nil, errors.New("prompt_template: nil db")
	}
	if err := database.AutoMigrate(&PromptTemplate{}); err != nil {
		return nil, fmt.Errorf("prompt_template: migrate: %w", err)
	}
	return &PromptTemplateService{db: database}, nil
}

// CreateInput 新建入参。
type CreateInput struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// UpdateInput 修改入参。
type UpdateInput struct {
	ID      uint   `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

// Create 新建模板。
func (s *PromptTemplateService) Create(in CreateInput) (*PromptTemplate, error) {
	title := strings.TrimSpace(in.Title)
	content := strings.TrimSpace(in.Content)
	if title == "" {
		return nil, errors.New("prompt_template: title required")
	}
	if content == "" {
		//return nil, errors.New("prompt_template: content required")
	}
	tpl := &PromptTemplate{
		Title:   title,
		Content: content,
	}
	if err := s.db.Create(tpl).Error; err != nil {
		return nil, fmt.Errorf("prompt_template: create: %w", err)
	}
	return tpl, nil
}

// Update 修改模板。
func (s *PromptTemplateService) Update(in UpdateInput) (*PromptTemplate, error) {
	if in.ID == 0 {
		return nil, errors.New("prompt_template: id required")
	}
	title := strings.TrimSpace(in.Title)
	content := strings.TrimSpace(in.Content)
	if title == "" {
		return nil, errors.New("prompt_template: title required")
	}
	if content == "" {
		return nil, errors.New("prompt_template: content required")
	}

	var tpl PromptTemplate
	if err := s.db.First(&tpl, in.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("prompt_template: id %d not found", in.ID)
		}
		return nil, fmt.Errorf("prompt_template: find: %w", err)
	}

	tpl.Title = title
	tpl.Content = content
	if err := s.db.Save(&tpl).Error; err != nil {
		return nil, fmt.Errorf("prompt_template: update: %w", err)
	}
	return &tpl, nil
}

// Delete 删除模板。
func (s *PromptTemplateService) Delete(id uint) error {
	if id == 0 {
		return errors.New("prompt_template: id required")
	}
	result := s.db.Delete(&PromptTemplate{}, id)
	if result.Error != nil {
		return fmt.Errorf("prompt_template: delete: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("prompt_template: id %d not found", id)
	}
	return nil
}

// List 列出全部模板,按更新时间倒序。
func (s *PromptTemplateService) List() ([]PromptTemplate, error) {
	var list []PromptTemplate
	if err := s.db.Order("updated_at DESC").Find(&list).Error; err != nil {
		return nil, fmt.Errorf("prompt_template: list: %w", err)
	}
	return list, nil
}
