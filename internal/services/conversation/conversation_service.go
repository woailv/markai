package conversation

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"gorm.io/gorm"

	"prompttool/internal/db"
	"prompttool/internal/services/conversation/aiproto"
	"prompttool/internal/services/snapshot"
)

const (
	roleUser      = "user"
	roleAssistant = "assistant"

	titleFallback = "新会话"
	titleMaxRunes = 40
)

// ConversationService 提供会话 / 消息 / 消息片段的读写。
//
// AI 消息的解析与执行:AppendMessage 里把 AI 消息内的所有指令拆成 MessageFragment
// 落库,然后异步交给 FragmentService 逐条自动应用,应用结果通过
// FragmentUpdatedEvent 推送给前端。前端不再自行解析原文,只按 fragments 渲染。
type ConversationService struct {
	db        *db.DB
	snapshots *snapshot.SnapshotService
	fragments *FragmentService
	logger    *slog.Logger
}

// NewConversationService 构造。所有依赖不可为 nil。
func NewConversationService(
	database *db.DB,
	snapshots *snapshot.SnapshotService,
	fragments *FragmentService,
	logger *slog.Logger,
) (*ConversationService, error) {
	if database == nil {
		return nil, errors.New("conversation: nil db")
	}
	if snapshots == nil {
		return nil, errors.New("conversation: nil snapshots service")
	}
	if fragments == nil {
		return nil, errors.New("conversation: nil fragments service")
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &ConversationService{
		db:        database,
		snapshots: snapshots,
		fragments: fragments,
		logger:    logger.With("component", "conversation"),
	}, nil
}

// ---------- 会话生命周期 ----------

// List 返回会话摘要列表,置顶项排最前,其后按 updatedAt 倒序。
func (s *ConversationService) List() ([]ConversationSummary, error) {
	var rows []Conversation
	if err := s.db.
		Order("pinned DESC, updated_at DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("conversation: list: %w", err)
	}
	if len(rows) == 0 {
		return []ConversationSummary{}, nil
	}

	ids := make([]uint64, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	var links []ConversationTemplate
	if err := s.db.
		Where("conversation_id IN ?", ids).
		Order("conversation_id ASC, id ASC").
		Find(&links).Error; err != nil {
		return nil, fmt.Errorf("conversation: load templates: %w", err)
	}

	tplByConv := make(map[uint64][]uint, len(rows))
	for _, l := range links {
		tplByConv[l.ConversationID] = append(tplByConv[l.ConversationID], l.TemplateID)
	}

	out := make([]ConversationSummary, 0, len(rows))
	for _, r := range rows {
		sum := toConversationSummary(r)
		if tpls := tplByConv[r.ID]; tpls != nil {
			sum.TemplateIDs = tpls
		} else {
			sum.TemplateIDs = []uint{}
		}
		out = append(out, sum)
	}
	return out, nil
}

// Get 返回会话详情。每条消息的 fragments 已按 order_index 排序并附在 DTO 上。
func (s *ConversationService) Get(id uint64) (*ConversationDetail, error) {
	if id == 0 {
		return nil, errors.New("conversation: id required")
	}
	var conv Conversation
	if err := s.db.First(&conv, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("conversation: not found: %d", id)
		}
		return nil, fmt.Errorf("conversation: get: %w", err)
	}
	var msgs []Message
	if err := s.db.
		Where("conversation_id = ?", id).
		Order("created_at ASC, id ASC").
		Find(&msgs).Error; err != nil {
		return nil, fmt.Errorf("conversation: load messages: %w", err)
	}

	var links []ConversationTemplate
	if err := s.db.Where("conversation_id = ?", id).Order("id ASC").Find(&links).Error; err != nil {
		return nil, fmt.Errorf("conversation: load templates: %w", err)
	}
	tplIDs := make([]uint, 0, len(links))
	for _, l := range links {
		tplIDs = append(tplIDs, l.TemplateID)
	}

	// 批量取所有 message 的 fragments,避免 N+1。
	fragsByMsg := map[uint64][]MessageFragmentDTO{}
	if len(msgs) > 0 {
		msgIDs := make([]uint64, 0, len(msgs))
		for _, m := range msgs {
			msgIDs = append(msgIDs, m.ID)
		}
		var frags []MessageFragment
		if err := s.db.
			Where("message_id IN ?", msgIDs).
			Order("message_id ASC, order_index ASC, id ASC").
			Find(&frags).Error; err != nil {
			return nil, fmt.Errorf("conversation: load fragments: %w", err)
		}
		for _, f := range frags {
			fragsByMsg[f.MessageID] = append(fragsByMsg[f.MessageID], toFragmentDTO(f))
		}
	}

	dtos := make([]MessageDTO, 0, len(msgs))
	for _, m := range msgs {
		dto := toMessageDTO(m)
		if fs, ok := fragsByMsg[m.ID]; ok {
			dto.Fragments = fs
		} else {
			dto.Fragments = []MessageFragmentDTO{}
		}
		dtos = append(dtos, dto)
	}

	summary := toConversationSummary(conv)
	summary.TemplateIDs = tplIDs

	return &ConversationDetail{
		Conversation: summary,
		Messages:     dtos,
	}, nil
}

// SetPinned 切换会话置顶状态。
func (s *ConversationService) SetPinned(in SetPinnedInput) error {
	if in.ConversationID == 0 {
		return errors.New("conversation: id required")
	}
	res := s.db.Model(&Conversation{}).
		Where("id = ?", in.ConversationID).
		Update("pinned", in.Pinned)
	if res.Error != nil {
		return fmt.Errorf("conversation: set pinned: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("conversation: not found: %d", in.ConversationID)
	}
	return nil
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

	res := s.db.Model(&Conversation{}).
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

// Delete 删除会话及其全部消息、片段与快照批次。
func (s *ConversationService) Delete(id uint64) error {
	if id == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.snapshots.DeleteByConversationTx(tx, id); err != nil {
			return fmt.Errorf("conversation: delete snapshots: %w", err)
		}
		// 级联:先取本会话所有 message id,再删片段。
		var msgIDs []uint64
		if err := tx.Model(&Message{}).
			Where("conversation_id = ?", id).
			Pluck("id", &msgIDs).Error; err != nil {
			return fmt.Errorf("conversation: list messages: %w", err)
		}
		if len(msgIDs) > 0 {
			if err := tx.Where("message_id IN ?", msgIDs).
				Delete(&MessageFragment{}).Error; err != nil {
				return fmt.Errorf("conversation: delete fragments: %w", err)
			}
		}
		if err := tx.Where("conversation_id = ?", id).
			Delete(&Message{}).Error; err != nil {
			return fmt.Errorf("conversation: delete messages: %w", err)
		}
		if err := tx.Where("conversation_id = ?", id).
			Delete(&ConversationTemplate{}).Error; err != nil {
			return fmt.Errorf("conversation: delete template links: %w", err)
		}
		if err := tx.Delete(&Conversation{}, id).Error; err != nil {
			return fmt.Errorf("conversation: delete: %w", err)
		}
		return nil
	})
}

// ClearMessages 清空消息(不删会话,不影响模板绑定)。
func (s *ConversationService) ClearMessages(id uint64) error {
	if id == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.snapshots.DeleteByConversationTx(tx, id); err != nil {
			return fmt.Errorf("conversation: clear snapshots: %w", err)
		}
		var msgIDs []uint64
		if err := tx.Model(&Message{}).
			Where("conversation_id = ?", id).
			Pluck("id", &msgIDs).Error; err != nil {
			return fmt.Errorf("conversation: list messages: %w", err)
		}
		if len(msgIDs) > 0 {
			if err := tx.Where("message_id IN ?", msgIDs).
				Delete(&MessageFragment{}).Error; err != nil {
				return fmt.Errorf("conversation: clear fragments: %w", err)
			}
		}
		if err := tx.Where("conversation_id = ?", id).Delete(&Message{}).Error; err != nil {
			return fmt.Errorf("conversation: clear messages: %w", err)
		}
		if err := tx.Model(&Conversation{}).Where("id = ?", id).
			Updates(map[string]any{
				"message_count": 0,
				"updated_at":    time.Now(),
			}).Error; err != nil {
			return fmt.Errorf("conversation: reset counters: %w", err)
		}
		return nil
	})
}

// SetTemplates 覆盖设置会话绑定的模板集合。
func (s *ConversationService) SetTemplates(in SetTemplatesInput) error {
	if in.ConversationID == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		seen := make(map[uint]struct{}, len(in.TemplateIDs))
		uniq := make([]uint, 0, len(in.TemplateIDs))
		for _, tid := range in.TemplateIDs {
			if tid == 0 {
				continue
			}
			if _, ok := seen[tid]; ok {
				continue
			}
			seen[tid] = struct{}{}
			uniq = append(uniq, tid)
		}

		if err := tx.Where("conversation_id = ?", in.ConversationID).
			Delete(&ConversationTemplate{}).Error; err != nil {
			return fmt.Errorf("conversation: clear template links: %w", err)
		}

		if len(uniq) > 0 {
			now := time.Now()
			links := make([]ConversationTemplate, 0, len(uniq))
			for _, tid := range uniq {
				links = append(links, ConversationTemplate{
					ConversationID: in.ConversationID,
					TemplateID:     tid,
					CreatedAt:      now,
				})
			}
			if err := tx.Create(&links).Error; err != nil {
				return fmt.Errorf("conversation: save template links: %w", err)
			}
		}

		if err := tx.Model(&Conversation{}).Where("id = ?", in.ConversationID).
			Update("updated_at", time.Now()).Error; err != nil {
			return fmt.Errorf("conversation: bump updated_at: %w", err)
		}
		return nil
	})
}

// ---------- 消息操作 ----------

// AppendMessage 向会话末尾追加消息。
//
// 若 in.ConversationID == 0,自动创建新会话。角色识别由后端根据 content 判定,
// 入参 Role 已被忽略。若判定为 assistant 且含指令,则同事务内把每条指令拆成
// pending fragment 落库,随后由 FragmentService 异步自动应用并推送状态。
func (s *ConversationService) AppendMessage(in AppendMessageInput) (*AppendMessageResult, error) {
	role := detectRole(in.Content)
	var (
		result       AppendMessageResult
		createdNew   bool
		autoApplyMsg uint64
	)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		convID := in.ConversationID

		if convID == 0 {
			conv := Conversation{
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
			var conv Conversation
			if err := tx.First(&conv, convID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("conversation: not found: %d", convID)
				}
				return fmt.Errorf("conversation: load: %w", err)
			}
			if !conv.TitleOverridden && role == roleUser {
				var userCount int64
				if err := tx.Model(&Message{}).
					Where("conversation_id = ? AND role = ?", convID, roleUser).
					Count(&userCount).Error; err != nil {
					return fmt.Errorf("conversation: count user msgs: %w", err)
				}
				if userCount == 0 {
					if err := tx.Model(&Conversation{}).
						Where("id = ?", convID).
						Update("title", titleFromContent(role, in.Content)).Error; err != nil {
						return fmt.Errorf("conversation: auto title: %w", err)
					}
				}
			}
		}

		msg := Message{
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

		// 拆分并落库 fragments;此时 status 均为 pending / parse_error。
		var fragDTOs []MessageFragmentDTO
		if role == roleAssistant {
			frags := BuildFragmentsFromContent(msg.ID, in.Content)
			if len(frags) > 0 {
				if err := InsertFragmentsTx(tx, frags); err != nil {
					return fmt.Errorf("conversation: insert fragments: %w", err)
				}
				fragDTOs = make([]MessageFragmentDTO, 0, len(frags))
				for _, f := range frags {
					fragDTOs = append(fragDTOs, toFragmentDTO(f))
				}
				autoApplyMsg = msg.ID
			}
		}

		if err := tx.Model(&Conversation{}).
			Where("id = ?", convID).
			Updates(map[string]any{
				"message_count": gorm.Expr("message_count + 1"),
				"updated_at":    now,
			}).Error; err != nil {
			return fmt.Errorf("conversation: bump counters: %w", err)
		}

		result.ConversationID = convID
		dto := toMessageDTO(msg)
		if fragDTOs == nil {
			dto.Fragments = []MessageFragmentDTO{}
		} else {
			dto.Fragments = fragDTOs
		}
		result.Message = dto
		return nil
	})
	if err != nil {
		return nil, err
	}
	result.CreatedNew = createdNew

	// AI 消息且已落 fragments:后台自动应用。
	if autoApplyMsg != 0 {
		go s.fragments.AutoApplyMessage(result.ConversationID, autoApplyMsg)
	}
	return &result, nil
}

// detectRole 判定消息角色。含指令标签 → assistant;否则 → user。
func detectRole(content string) string {
	if aiproto.HasCommandTag(content) {
		return roleAssistant
	}
	return roleUser
}

// UpdateMessage 仅修改消息正文,不重新解析 fragments。
// 若确实需要重新解析,请单独提供一个"重新拆分"的接口(未来扩展)。
func (s *ConversationService) UpdateMessage(in UpdateMessageInput) (*MessageDTO, error) {
	if in.MessageID == 0 {
		return nil, errors.New("conversation: message id required")
	}
	var msg Message
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
		if err := tx.Model(&Message{}).
			Where("id = ?", msg.ID).
			Updates(map[string]any{"content": in.Content, "updated_at": now}).Error; err != nil {
			return fmt.Errorf("conversation: update message: %w", err)
		}
		if err := tx.Model(&Conversation{}).
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

// DeleteMessage 删除一条消息,连同其 fragments 与关联的快照批次一起删除。
func (s *ConversationService) DeleteMessage(id uint64) error {
	if id == 0 {
		return errors.New("conversation: message id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		var msg Message
		if err := tx.First(&msg, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("conversation: message not found: %d", id)
			}
			return fmt.Errorf("conversation: load message: %w", err)
		}
		if msg.BatchID != 0 {
			if err := s.snapshots.DeleteBatchTx(tx, msg.BatchID); err != nil {
				return fmt.Errorf("conversation: delete batch: %w", err)
			}
		}
		if err := tx.Where("message_id = ?", id).Delete(&MessageFragment{}).Error; err != nil {
			return fmt.Errorf("conversation: delete fragments: %w", err)
		}
		if err := tx.Delete(&Message{}, id).Error; err != nil {
			return fmt.Errorf("conversation: delete message: %w", err)
		}
		now := time.Now()
		if err := tx.Model(&Conversation{}).
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

func toConversationSummary(c Conversation) ConversationSummary {
	title := c.Title
	if strings.TrimSpace(title) == "" {
		title = titleFallback
	}
	return ConversationSummary{
		ID:              c.ID,
		Title:           title,
		TitleOverridden: c.TitleOverridden,
		Pinned:          c.Pinned,
		MessageCount:    c.MessageCount,
		CreatedAt:       c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       c.UpdatedAt.Format(time.RFC3339),
	}
}

func toMessageDTO(m Message) MessageDTO {
	return MessageDTO{
		ID:             m.ID,
		ConversationID: m.ConversationID,
		Role:           m.Role,
		Content:        m.Content,
		BatchID:        m.BatchID,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      m.UpdatedAt.Format(time.RFC3339),
		Fragments:      []MessageFragmentDTO{},
	}
}

// titleFromContent 从消息内容生成标题;仅在 user 消息且尚未覆盖时使用。
func titleFromContent(role, content string) string {
	if role != roleUser {
		return titleFallback
	}
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
