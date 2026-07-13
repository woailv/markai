package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"prompttool/internal/db"
)

const (
	roleUser      = "user"
	roleAssistant = "assistant"

	titleFallback   = "新会话"
	titleMaxRunes   = 40
)

// ConversationService 提供会话与消息的持久化能力。
type ConversationService struct {
	db *db.DB
}

// NewConversationService 构造函数。调用方负责保证 database 非空。
func NewConversationService(database *db.DB) (*ConversationService, error) {
	if database == nil {
		return nil, errors.New("conversation: nil db")
	}
	return &ConversationService{db: database}, nil
}

// ---------- 会话生命周期 ----------

// List 返回会话摘要列表,按 updatedAt 倒序。
func (s *ConversationService) List() ([]ConversationSummary, error) {
	var rows []db.Conversation
	if err := s.db.
		Order("updated_at DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("conversation: list: %w", err)
	}
	out := make([]ConversationSummary, 0, len(rows))
	for _, r := range rows {
		out = append(out, toConversationSummary(r))
	}
	return out, nil
}

// Get 返回会话详情(含消息序列)。
func (s *ConversationService) Get(id uint64) (*ConversationDetail, error) {
	if id == 0 {
		return nil, errors.New("conversation: id required")
	}
	var conv db.Conversation
	if err := s.db.First(&conv, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("conversation: not found: %d", id)
		}
		return nil, fmt.Errorf("conversation: get: %w", err)
	}
	var msgs []db.Message
	if err := s.db.
		Where("conversation_id = ?", id).
		Order("created_at ASC, id ASC").
		Find(&msgs).Error; err != nil {
		return nil, fmt.Errorf("conversation: load messages: %w", err)
	}
	dtos := make([]MessageDTO, 0, len(msgs))
	for _, m := range msgs {
		dtos = append(dtos, toMessageDTO(m))
	}
	return &ConversationDetail{
		Conversation: toConversationSummary(conv),
		Messages:     dtos,
	}, nil
}

// Rename 更新会话标题,并标记为用户覆盖(避免后续自动摘要覆写)。
func (s *ConversationService) Rename(in RenameConversationInput) error {
	if in.ConversationID == 0 {
		return errors.New("conversation: id required")
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return errors.New("conversation: title required")
	}
	title = truncateRunes(title, titleMaxRunes)

	res := s.db.Model(&db.Conversation{}).
		Where("id = ?", in.ConversationID).
		Updates(map[string]any{
			"title":            title,
			"title_overridden": true,
			"updated_at":       time.Now(),
		})
	if res.Error != nil {
		return fmt.Errorf("conversation: rename: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("conversation: not found: %d", in.ConversationID)
	}
	return nil
}

// Delete 删除会话及其全部消息与快照批次。
func (s *ConversationService) Delete(id uint64) error {
	if id == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先找出该会话下的批次,连带删除快照
		var batches []db.SnapshotBatch
		if err := tx.Where("conversation_id = ?", id).Find(&batches).Error; err != nil {
			return fmt.Errorf("conversation: load batches: %w", err)
		}
		if len(batches) > 0 {
			ids := make([]uint64, 0, len(batches))
			for _, b := range batches {
				ids = append(ids, b.ID)
			}
			if err := tx.Where("batch_id IN ?", ids).
				Delete(&db.FileSnapshot{}).Error; err != nil {
				return fmt.Errorf("conversation: delete snapshots: %w", err)
			}
			if err := tx.Where("conversation_id = ?", id).
				Delete(&db.SnapshotBatch{}).Error; err != nil {
				return fmt.Errorf("conversation: delete batches: %w", err)
			}
		}
		if err := tx.Where("conversation_id = ?", id).
			Delete(&db.Message{}).Error; err != nil {
			return fmt.Errorf("conversation: delete messages: %w", err)
		}
		if err := tx.Delete(&db.Conversation{}, id).Error; err != nil {
			return fmt.Errorf("conversation: delete: %w", err)
		}
		return nil
	})
}

// ---------- 消息操作 ----------

// AppendMessage 向会话末尾追加消息。
// 若 in.ConversationID == 0,自动创建新会话;标题从首条 user 消息摘要生成。
func (s *ConversationService) AppendMessage(in AppendMessageInput) (*AppendMessageResult, error) {
	role := strings.TrimSpace(in.Role)
	if role != roleUser && role != roleAssistant {
		return nil, fmt.Errorf("conversation: invalid role %q", in.Role)
	}
	// 允许 content 为空字符串以承载纯占位/回执,但要过滤 nil 场景由 Go 天然保证。

	var (
		result     AppendMessageResult
		createdNew bool
	)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		convID := in.ConversationID

		if convID == 0 {
			conv := db.Conversation{
				Title:     titleFromContent(role, in.Content),
				CreatedAt: now,
				UpdatedAt: now,
			}
			if err := tx.Create(&conv).Error; err != nil {
				return fmt.Errorf("conversation: create: %w", err)
			}
			convID = conv.ID
			createdNew = true
		} else {
			// 确认会话存在,并在需要时用首条 user 消息填充自动标题
			var conv db.Conversation
			if err := tx.First(&conv, convID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("conversation: not found: %d", convID)
				}
				return fmt.Errorf("conversation: load: %w", err)
			}
			if !conv.TitleOverridden && role == roleUser {
				var userCount int64
				if err := tx.Model(&db.Message{}).
					Where("conversation_id = ? AND role = ?", convID, roleUser).
					Count(&userCount).Error; err != nil {
					return fmt.Errorf("conversation: count user msgs: %w", err)
				}
				if userCount == 0 {
					if err := tx.Model(&db.Conversation{}).
						Where("id = ?", convID).
						Update("title", titleFromContent(role, in.Content)).Error; err != nil {
						return fmt.Errorf("conversation: auto title: %w", err)
					}
				}
			}
		}

		msg := db.Message{
			ConversationID: convID,
			Role:           role,
			Content:        in.Content,
			BatchID:        in.BatchID,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := tx.Create(&msg).Error; err != nil {
			return fmt.Errorf("conversation: append message: %w", err)
		}

		if err := tx.Model(&db.Conversation{}).
			Where("id = ?", convID).
			Updates(map[string]any{
				"message_count": gorm.Expr("message_count + 1"),
				"updated_at":    now,
			}).Error; err != nil {
			return fmt.Errorf("conversation: bump counters: %w", err)
		}

		result.ConversationID = convID
		result.Message = toMessageDTO(msg)
		return nil
	})
	if err != nil {
		return nil, err
	}
	result.CreatedNew = createdNew
	return &result, nil
}

// UpdateMessage 仅修改消息正文,不重放执行。
func (s *ConversationService) UpdateMessage(in UpdateMessageInput) (*MessageDTO, error) {
	if in.MessageID == 0 {
		return nil, errors.New("conversation: message id required")
	}
	var msg db.Message
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&msg, in.MessageID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("conversation: message not found: %d", in.MessageID)
			}
			return fmt.Errorf("conversation: load message: %w", err)
		}
		now := time.Now()
		msg.Content = in.Content
		msg.UpdatedAt = now
		if err := tx.Model(&db.Message{}).
			Where("id = ?", msg.ID).
			Updates(map[string]any{"content": in.Content, "updated_at": now}).Error; err != nil {
			return fmt.Errorf("conversation: update message: %w", err)
		}
		if err := tx.Model(&db.Conversation{}).
			Where("id = ?", msg.ConversationID).
			Update("updated_at", now).Error; err != nil {
			return fmt.Errorf("conversation: bump updated_at: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	dto := toMessageDTO(msg)
	return &dto, nil
}

// DeleteMessage 删除一条消息;若关联了快照批次,一并删除批次与快照数据。
// 该操作不会撤销文件修改(文件已落地),仅移除记录。
func (s *ConversationService) DeleteMessage(id uint64) error {
	if id == 0 {
		return errors.New("conversation: message id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		var msg db.Message
		if err := tx.First(&msg, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("conversation: message not found: %d", id)
			}
			return fmt.Errorf("conversation: load message: %w", err)
		}
		if msg.BatchID != 0 {
			if err := tx.Where("batch_id = ?", msg.BatchID).
				Delete(&db.FileSnapshot{}).Error; err != nil {
				return fmt.Errorf("conversation: delete snapshots: %w", err)
			}
			if err := tx.Delete(&db.SnapshotBatch{}, msg.BatchID).Error; err != nil {
				return fmt.Errorf("conversation: delete batch: %w", err)
			}
		}
		if err := tx.Delete(&db.Message{}, id).Error; err != nil {
			return fmt.Errorf("conversation: delete message: %w", err)
		}
		now := time.Now()
		if err := tx.Model(&db.Conversation{}).
			Where("id = ?", msg.ConversationID).
			Updates(map[string]any{
				"message_count": gorm.Expr("MAX(message_count - 1, 0)"),
				"updated_at":    now,
			}).Error; err != nil {
			return fmt.Errorf("conversation: bump counters: %w", err)
		}
		return nil
	})
}

// ---------- 辅助 ----------

func toConversationSummary(c db.Conversation) ConversationSummary {
	title := c.Title
	if strings.TrimSpace(title) == "" {
		title = titleFallback
	}
	return ConversationSummary{
		ID:              c.ID,
		Title:           title,
		TitleOverridden: c.TitleOverridden,
		MessageCount:    c.MessageCount,
		CreatedAt:       c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       c.UpdatedAt.Format(time.RFC3339),
	}
}

func toMessageDTO(m db.Message) MessageDTO {
	return MessageDTO{
		ID:             m.ID,
		ConversationID: m.ConversationID,
		Role:           m.Role,
		Content:        m.Content,
		BatchID:        m.BatchID,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      m.UpdatedAt.Format(time.RFC3339),
	}
}

// titleFromContent 从消息内容生成标题;仅在 user 消息且尚未覆盖时使用。
func titleFromContent(role, content string) string {
	if role != roleUser {
		return titleFallback
	}
	// 取首个非空行,去除 Markdown 常见前缀
	s := strings.TrimSpace(content)
	if s == "" {
		return titleFallback
	}
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		s = s[:idx]
	}
	s = strings.TrimLeft(s, "#>-* \t")
	s = strings.TrimSpace(s)
	if s == "" {
		return titleFallback
	}
	return truncateRunes(s, titleMaxRunes)
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return s
	}
	rs := []rune(s)
	if len(rs) <= max {
		return s
	}
	return string(rs[:max]) + "…"
}