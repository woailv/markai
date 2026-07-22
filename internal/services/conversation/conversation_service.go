package conversation

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"prompttool/internal/db"
	"prompttool/internal/pkg/eventbus"
	"prompttool/internal/services/conversation/aiproto"
	"prompttool/internal/services/snapshot"
)

const (
	roleUser      = "user"
	roleAssistant = "assistant"

	titleFallback = "新会话"
	titleMaxRunes = 40

	// MessageUpdatedEvent 后端在 AI 消息执行流水线的关键节点广播的事件名。
	// 前端订阅后合并到本地状态,以呈现 pending → done 的过渡。
	MessageUpdatedEvent = "conversation:message-updated"
)

// MessageUpdatedPayload 事件负载:告诉前端某条消息的最新正文。
type MessageUpdatedPayload struct {
	ConversationID uint64     `json:"conversationId"`
	Message        MessageDTO `json:"message"`
}

// ConversationService 提供会话与消息的持久化能力,并在 AI 消息追加时
// 编排"解析 → 快照批次 → 执行 → 通过事件推送最新态"的流水线。
type ConversationService struct {
	db        *db.DB
	snapshots *snapshot.SnapshotService
	executor  *aiproto.Executor
	logger    *slog.Logger

	mu      sync.RWMutex
	emitter eventbus.Emitter
}

// NewConversationService 构造函数。files/snapshots/logger 均不可为 nil。
// executor 由本函数根据 files 构造。
func NewConversationService(
	database *db.DB,
	snapshots *snapshot.SnapshotService,
	files aiproto.FileOps,
	logger *slog.Logger,
) (*ConversationService, error) {
	if database == nil {
		return nil, errors.New("conversation: nil db")
	}
	if snapshots == nil {
		return nil, errors.New("conversation: nil snapshots service")
	}
	if files == nil {
		return nil, errors.New("conversation: nil file service")
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &ConversationService{
		db:        database,
		snapshots: snapshots,
		executor:  aiproto.NewExecutor(files),
		logger:    logger.With("component", "conversation"),
	}, nil
}

// SetEmitter 注入事件推送能力。未注入时 AI 消息流水线仍会执行,但不广播事件,
// 前端只能靠下次拉取才能看到最新态。
func (s *ConversationService) SetEmitter(e eventbus.Emitter) {
	s.mu.Lock()
	s.emitter = e
	s.mu.Unlock()
}

func (s *ConversationService) getEmitter() eventbus.Emitter {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.emitter
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

	// 避免 N+1, 批量获取所有会话的关联模板
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
			sum.TemplateIDs = []uint{} // 保证给前端的是空数组而不是 null
		}
		out = append(out, sum)
	}
	return out, nil
}

// Get 返回会话详情(含消息序列)。
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

	// 加载会话绑定的模板 ID
	var links []ConversationTemplate
	if err := s.db.Where("conversation_id = ?", id).Order("id ASC").Find(&links).Error; err != nil {
		return nil, fmt.Errorf("conversation: load templates: %w", err)
	}
	tplIDs := make([]uint, 0, len(links))
	for _, l := range links {
		tplIDs = append(tplIDs, l.TemplateID)
	}

	dtos := make([]MessageDTO, 0, len(msgs))
	for _, m := range msgs {
		dtos = append(dtos, toMessageDTO(m))
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

// Delete 删除会话及其全部消息与快照批次。
func (s *ConversationService) Delete(id uint64) error {
	if id == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.snapshots.DeleteByConversationTx(tx, id); err != nil {
			return fmt.Errorf("conversation: delete snapshots: %w", err)
		}
		if err := tx.Where("conversation_id = ?", id).
			Delete(&Message{}).Error; err != nil {
			return fmt.Errorf("conversation: delete messages: %w", err)
		}
		// 级联清理模板关联
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

// ClearMessages 清空消息接口（不删除会话，不影响绑定的模板）
func (s *ConversationService) ClearMessages(id uint64) error {
	if id == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.snapshots.DeleteByConversationTx(tx, id); err != nil {
			return fmt.Errorf("conversation: clear snapshots: %w", err)
		}
		if err := tx.Where("conversation_id = ?", id).Delete(&Message{}).Error; err != nil {
			return fmt.Errorf("conversation: clear messages: %w", err)
		}

		// 重置计数
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

// SetTemplates 覆盖设置会话绑定的模板集合 (前端多选框切换时调用)
func (s *ConversationService) SetTemplates(in SetTemplatesInput) error {
	if in.ConversationID == 0 {
		return errors.New("conversation: id required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 去重处理
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

		// 先全量删除旧绑定
		if err := tx.Where("conversation_id = ?", in.ConversationID).
			Delete(&ConversationTemplate{}).Error; err != nil {
			return fmt.Errorf("conversation: clear template links: %w", err)
		}

		// 重建新绑定
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

		// 更新会话 updatedAt
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
// 若 in.ConversationID == 0,自动创建新会话;标题从首条 user 消息摘要生成。
//
// 角色识别:入参 Role 已被忽略,后端根据 content 内是否包含指令标签自行判定
// (与旧的前端 COMMAND_TAG_DETECT_RE 行为一致)。若判定为 assistant 且包含
// 至少一条可执行指令,则:
//  1. 同步开启快照批次并把 pending sentinel 一起写入消息;
//  2. 启动 goroutine 顺序执行,执行完再写入 done sentinel;
//  3. 每个关键节点通过 MessageUpdatedEvent 事件广播给前端。
//
// 事件负载见 MessageUpdatedPayload。
func (s *ConversationService) AppendMessage(in AppendMessageInput) (*AppendMessageResult, error) {
	// content 允许为空以承载纯占位。

	role := detectRole(in.Content)
	var (
		result     AppendMessageResult
		createdNew bool

		aiRanges []aiproto.ParseItemWithRange
		aiBatch  uint64
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
			// 确认会话存在,并在需要时用首条 user 消息填充自动标题
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

		content := in.Content
		batchID := in.BatchID
		// 仅 assistant 且包含可执行指令时才走流水线;pending sentinel 先落库。
		if role == roleAssistant {
			ranges := aiproto.ParseCommandsWithRanges(content)
			if len(ranges) > 0 {
				// 该事务内先建批次,拿到 batchID 一起写入 pending sentinel。
				batch := snapshot.SnapshotBatch{
					ConversationID: convID,
					CreatedAt:      now,
				}
				if err := tx.Create(&batch).Error; err != nil {
					return fmt.Errorf("conversation: begin batch: %w", err)
				}
				batchID = batch.ID
				aiBatch = batch.ID
				aiRanges = ranges
				content = aiproto.WithExecMeta(content, aiproto.ExecMeta{
					Status:        "pending",
					BatchID:       batchID,
					TotalCommands: len(ranges),
					Segments:      aiproto.BuildSegments(content, ranges, nil),
				})
			}
		}

		msg := Message{
			ConversationID: convID,
			Role:           role,
			Content:        content,
			BatchID:        batchID,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := tx.Create(&msg).Error; err != nil {
			return fmt.Errorf("conversation: append message: %w", err)
		}
		// 批次事后回填 message_id,以支持后续 SnapshotService.Status 从 batchId 找回 message。
		if aiBatch != 0 {
			if err := tx.Model(&snapshot.SnapshotBatch{}).
				Where("id = ?", aiBatch).
				Update("message_id", msg.ID).Error; err != nil {
				return fmt.Errorf("conversation: bind batch: %w", err)
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
		result.Message = toMessageDTO(msg)
		return nil
	})
	if err != nil {
		return nil, err
	}
	result.CreatedNew = createdNew

	// 有指令待执行时,在后台完成执行并推事件通知前端刷新。
	if len(aiRanges) > 0 && result.Message.ID != 0 {
		go s.runAIPipeline(result.ConversationID, result.Message.ID, in.Content, aiBatch, aiRanges)
	}
	return &result, nil
}

// runAIPipeline 在后台顺序执行 AI 指令,完成后把 done sentinel 写回消息并 emit 事件。
// 该协程要求 aiRanges 与 batchID 均已就绪(由 AppendMessage 事务内准备)。
func (s *ConversationService) runAIPipeline(
	convID uint64,
	msgID uint64,
	rawContent string,
	batchID uint64,
	ranges []aiproto.ParseItemWithRange,
) {
	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("AI pipeline panic", "err", r, "messageId", msgID)
		}
	}()

	items := make([]aiproto.ParseItem, 0, len(ranges))
	for _, r := range ranges {
		items = append(items, r.Item)
	}
	report := s.executor.Execute(items, batchID)
	report.BatchID = batchID

	finalContent := aiproto.WithExecMeta(rawContent, aiproto.ExecMeta{
		Status:        "done",
		BatchID:       batchID,
		TotalCommands: len(ranges),
		Segments:      aiproto.BuildSegments(rawContent, ranges, &report),
	})

	dto, err := s.writeMessageContent(msgID, finalContent)
	if err != nil {
		s.logger.Error("update message after AI execution", "err", err, "messageId", msgID)
		return
	}
	s.emitMessageUpdated(convID, dto)
}

// writeMessageContent 只更新消息正文与 updatedAt。用于流水线内部,不复用 UpdateMessage
// 是为了绕开公开 API 的入参校验并保证返回最新 DTO。
func (s *ConversationService) writeMessageContent(msgID uint64, content string) (MessageDTO, error) {
	var out MessageDTO
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var msg Message
		if err := tx.First(&msg, msgID).Error; err != nil {
			return err
		}
		now := time.Now()
		msg.Content = content
		msg.UpdatedAt = now
		if err := tx.Model(&Message{}).
			Where("id = ?", msg.ID).
			Updates(map[string]any{"content": content, "updated_at": now}).Error; err != nil {
			return err
		}
		if err := tx.Model(&Conversation{}).
			Where("id = ?", msg.ConversationID).
			Update("updated_at", now).Error; err != nil {
			return err
		}
		out = toMessageDTO(msg)
		return nil
	})
	return out, err
}

func (s *ConversationService) emitMessageUpdated(convID uint64, msg MessageDTO) {
	e := s.getEmitter()
	if e == nil {
		return
	}
	e.EmitEvent(MessageUpdatedEvent, MessageUpdatedPayload{
		ConversationID: convID,
		Message:        msg,
	})
}

// detectRole 判定消息角色。含指令标签 → assistant;否则 → user。
func detectRole(content string) string {
	if aiproto.HasCommandTag(content) {
		return roleAssistant
	}
	return roleUser
}

// UpdateMessage 仅修改消息正文,不重放执行。
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

// DeleteMessage 删除一条消息;若关联了快照批次,一并删除批次与快照数据。
// 该操作不会撤销文件修改(文件已落地),仅移除记录。
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
