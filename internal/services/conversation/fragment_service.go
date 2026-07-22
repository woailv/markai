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
	"prompttool/internal/services/file"
	"prompttool/internal/services/snapshot"
)

// FragmentUpdatedEvent 后端在 fragment 状态变更时广播,前端订阅后局部刷新。
const FragmentUpdatedEvent = "conversation:fragment-updated"

// FragmentUpdatedPayload 事件负载。ConversationID 用于订阅端过滤。
type FragmentUpdatedPayload struct {
	ConversationID uint64             `json:"conversationId"`
	Fragment       MessageFragmentDTO `json:"fragment"`
}

// FragmentService 管理消息片段的生命周期:构建 / 自动应用 / 手动 apply / 编辑 / 忽略。
//
// 该服务与 ConversationService 共用一份数据库,以便在同一事务里插入消息 + fragments。
// FileService 抽象成 aiproto.FileOps 供文件动作使用;Snapshots 负责 batch 生命周期。
type FragmentService struct {
	db        *db.DB
	files     *file.FileService
	snapshots *snapshot.SnapshotService
	logger    *slog.Logger

	mu      sync.RWMutex
	emitter eventbus.Emitter
}

// NewFragmentService 构造。files/snapshots/logger 均不可为 nil。
func NewFragmentService(
	database *db.DB,
	files *file.FileService,
	snapshots *snapshot.SnapshotService,
	logger *slog.Logger,
) (*FragmentService, error) {
	if database == nil {
		return nil, errors.New("fragment: nil db")
	}
	if files == nil {
		return nil, errors.New("fragment: nil files")
	}
	if snapshots == nil {
		return nil, errors.New("fragment: nil snapshots")
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &FragmentService{
		db:        database,
		files:     files,
		snapshots: snapshots,
		logger:    logger.With("component", "fragment"),
	}, nil
}

// SetEmitter 注入事件推送能力。
func (s *FragmentService) SetEmitter(e eventbus.Emitter) {
	s.mu.Lock()
	s.emitter = e
	s.mu.Unlock()
}

func (s *FragmentService) getEmitter() eventbus.Emitter {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.emitter
}

// ---------- 构建 ----------

// BuildFragmentsFromContent 把消息原文解析为待落库的 MessageFragment 切片。
// 无指令的普通文本段会被包装成 FragmentText,原文按顺序保存在 Before 字段里。
// 这样前端只需按 order_index 顺序渲染 fragments 即可复原整条消息,
// 不再依赖 message.content。messageID 可为 0(调用方稍后回填)。
func BuildFragmentsFromContent(messageID uint64, content string) []MessageFragment {
	ranges := aiproto.ParseCommandsWithRanges(content)
	out := make([]MessageFragment, 0, len(ranges)*2+1)
	order := 0
	cursor := 0

	// appendText 把 [from,to) 之间的原文作为 TEXT 段追加(允许空串跳过)。
	appendText := func(from, to int) {
		if from >= to {
			return
		}
		out = append(out, MessageFragment{
			MessageID:  messageID,
			OrderIndex: order,
			Kind:       FragmentText,
			RawStart:   from,
			RawEnd:     to,
			Before:     content[from:to],
			Status:     StatusText,
		})
		order++
	}

	for _, r := range ranges {
		// 先补齐上一命令与当前命令之间的普通文本。
		appendText(cursor, r.Start)
		cursor = r.End

		if r.Item.IsParseError() {
			// 解析错误也把原始片段文本存下来,方便前端原样展示。
			raw := ""
			if r.Start >= 0 && r.End <= len(content) && r.Start < r.End {
				raw = content[r.Start:r.End]
			}
			out = append(out, MessageFragment{
				MessageID:   messageID,
				OrderIndex:  order,
				Kind:        FragmentParseError,
				RawStart:    r.Start,
				RawEnd:      r.End,
				Before:      raw,
				Status:      StatusParseError,
				MatchReason: r.Item.Message,
			})
			order++
			continue
		}
		cmd := r.Item.Command
		switch cmd.Kind {
		case aiproto.KindWriteFile:
			out = append(out, MessageFragment{
				MessageID:  messageID,
				OrderIndex: order,
				Kind:       FragmentWriteFile,
				Path:       cmd.Path,
				RawStart:   r.Start,
				RawEnd:     r.End,
				After:      cmd.Content,
				Status:     StatusPending,
			})
			order++
		case aiproto.KindEditFile:
			for i, blk := range cmd.Edits {
				out = append(out, MessageFragment{
					MessageID:  messageID,
					OrderIndex: order,
					Kind:       FragmentEditBlock,
					Path:       cmd.Path,
					RawStart:   r.Start,
					RawEnd:     r.End,
					BlockIndex: i,
					Before:     blk.Search,
					After:      blk.Replace,
					Status:     StatusPending,
				})
				order++
			}
		case aiproto.KindDeleteFile:
			out = append(out, MessageFragment{
				MessageID:  messageID,
				OrderIndex: order,
				Kind:       FragmentDeleteFile,
				Path:       cmd.Path,
				RawStart:   r.Start,
				RawEnd:     r.End,
				Status:     StatusPending,
			})
			order++
		case aiproto.KindMovePath:
			out = append(out, MessageFragment{
				MessageID:   messageID,
				OrderIndex:  order,
				Kind:        FragmentMovePath,
				Path:        cmd.Source,
				Destination: cmd.Destination,
				RawStart:    r.Start,
				RawEnd:      r.End,
				Status:      StatusPending,
			})
			order++
		case aiproto.KindCreateDirectory:
			out = append(out, MessageFragment{
				MessageID:  messageID,
				OrderIndex: order,
				Kind:       FragmentCreateDirectory,
				Path:       cmd.Path,
				RawStart:   r.Start,
				RawEnd:     r.End,
				Status:     StatusPending,
			})
			order++
		case aiproto.KindRequestFile:
			out = append(out, MessageFragment{
				MessageID:  messageID,
				OrderIndex: order,
				Kind:       FragmentRequestFile,
				Path:       cmd.Path,
				RawStart:   r.Start,
				RawEnd:     r.End,
				Status:     StatusPending, // AutoApply 会读取内容并置 resolved
			})
			order++
		case aiproto.KindRequestDirectoryList:
			out = append(out, MessageFragment{
				MessageID:  messageID,
				OrderIndex: order,
				Kind:       FragmentRequestDirectoryList,
				Path:       cmd.Path,
				RawStart:   r.Start,
				RawEnd:     r.End,
				Status:     StatusPending,
			})
			order++
		}
	}
	// 末尾残余的普通文本。
	appendText(cursor, len(content))
	return out
}

// InsertFragmentsTx 在给定事务里批量插入 fragments。
func InsertFragmentsTx(tx *gorm.DB, fragments []MessageFragment) error {
	if len(fragments) == 0 {
		return nil
	}
	now := time.Now()
	for i := range fragments {
		fragments[i].CreatedAt = now
		fragments[i].UpdatedAt = now
	}
	return tx.Create(&fragments).Error
}

// ---------- 自动应用 ----------

// AutoApplyMessage 在后台顺序应用一条消息里的所有待应用 fragment。
// 匹配失败的条目不中断整体,只自身进入 match_failed。
func (s *FragmentService) AutoApplyMessage(convID, messageID uint64) {
	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("auto-apply panic", "err", r, "messageId", messageID)
		}
	}()

	var frags []MessageFragment
	if err := s.db.
		Where("message_id = ? AND status = ?", messageID, StatusPending).
		Order("order_index ASC").
		Find(&frags).Error; err != nil {
		s.logger.Error("auto-apply: load fragments", "err", err, "messageId", messageID)
		return
	}
	if len(frags) == 0 {
		return
	}

	// 预判是否需要文件级 batch(除只读 REQUEST_* 外都需要)。
	needsBatch := false
	for _, f := range frags {
		if isModifying(f.Kind) {
			needsBatch = true
			break
		}
	}
	var batchID uint64
	if needsBatch {
		bid, err := s.ensureBatchForMessage(convID, messageID)
		if err != nil {
			s.logger.Error("auto-apply: ensure batch", "err", err, "messageId", messageID)
			return
		}
		batchID = bid
	}

	for _, f := range frags {
		s.applyOne(convID, &f, batchID)
	}
}

// ---------- 手动 apply ----------

// ApplyFragments 用户主动触发一次应用。FragmentIDs 为空时对整条消息里
// 所有 pending / match_failed 的 fragment 执行。
func (s *FragmentService) ApplyFragments(in ApplyFragmentsInput) (*ApplyFragmentsResult, error) {
	if in.MessageID == 0 {
		return nil, errors.New("fragment: message id required")
	}

	var msg Message
	if err := s.db.First(&msg, in.MessageID).Error; err != nil {
		return nil, fmt.Errorf("fragment: load message: %w", err)
	}

	var frags []MessageFragment
	q := s.db.Where("message_id = ?", in.MessageID)
	if len(in.FragmentIDs) > 0 {
		q = q.Where("id IN ?", in.FragmentIDs)
	} else {
		q = q.Where("status IN ?", []FragmentStatus{StatusPending, StatusMatchFailed})
	}
	if err := q.Order("order_index ASC").Find(&frags).Error; err != nil {
		return nil, fmt.Errorf("fragment: load: %w", err)
	}

	// 只对 modifying 类型申请 batch;若一批全是 REQUEST_* 则无需 batch。
	needsBatch := false
	for _, f := range frags {
		if isModifying(f.Kind) {
			needsBatch = true
			break
		}
	}
	var batchID uint64
	if needsBatch {
		bid, err := s.ensureBatchForMessage(msg.ConversationID, msg.ID)
		if err != nil {
			return nil, err
		}
		batchID = bid
	}

	for i := range frags {
		s.applyOne(msg.ConversationID, &frags[i], batchID)
	}

	dtos := make([]MessageFragmentDTO, 0, len(frags))
	for _, f := range frags {
		dtos = append(dtos, toFragmentDTO(f))
	}
	return &ApplyFragmentsResult{Fragments: dtos}, nil
}

// UpdateFragment 编辑失败片段的内容,并把状态重置为 pending 供再次应用。
func (s *FragmentService) UpdateFragment(in UpdateFragmentInput) (*MessageFragmentDTO, error) {
	if in.FragmentID == 0 {
		return nil, errors.New("fragment: fragment id required")
	}
	var frag MessageFragment
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&frag, in.FragmentID).Error; err != nil {
			return err
		}
		updates := map[string]any{}
		if in.Path != nil {
			frag.Path = *in.Path
			updates["path"] = *in.Path
		}
		if in.Destination != nil {
			frag.Destination = *in.Destination
			updates["destination"] = *in.Destination
		}
		if in.Before != nil {
			frag.Before = *in.Before
			updates["before"] = *in.Before
		}
		if in.After != nil {
			frag.After = *in.After
			updates["after"] = *in.After
		}
		// 内容被改动后视为新一轮尝试,重置为 pending 与清理错因。
		frag.Status = StatusPending
		frag.MatchReason = ""
		frag.UpdatedAt = time.Now()
		updates["status"] = StatusPending
		updates["match_reason"] = ""
		updates["updated_at"] = frag.UpdatedAt

		if len(updates) == 0 {
			return nil
		}
		return tx.Model(&MessageFragment{}).
			Where("id = ?", frag.ID).
			Updates(updates).Error
	})
	if err != nil {
		return nil, fmt.Errorf("fragment: update: %w", err)
	}
	dto := toFragmentDTO(frag)
	s.emitFragment(dto)
	return &dto, nil
}

// SetFragmentStatus 只支持 pending ↔ ignored 切换。其他状态不受此接口影响。
func (s *FragmentService) SetFragmentStatus(in SetFragmentStatusInput) (*MessageFragmentDTO, error) {
	if in.FragmentID == 0 {
		return nil, errors.New("fragment: fragment id required")
	}
	target := FragmentStatus(strings.TrimSpace(in.Status))
	if target != StatusIgnored && target != StatusPending {
		return nil, fmt.Errorf("fragment: unsupported target status %q", in.Status)
	}
	var frag MessageFragment
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&frag, in.FragmentID).Error; err != nil {
			return err
		}
		frag.Status = target
		if target == StatusIgnored {
			frag.MatchReason = "已忽略"
		} else {
			frag.MatchReason = ""
		}
		frag.UpdatedAt = time.Now()
		return tx.Model(&MessageFragment{}).
			Where("id = ?", frag.ID).
			Updates(map[string]any{
				"status":       frag.Status,
				"match_reason": frag.MatchReason,
				"updated_at":   frag.UpdatedAt,
			}).Error
	})
	if err != nil {
		return nil, fmt.Errorf("fragment: set status: %w", err)
	}
	dto := toFragmentDTO(frag)
	s.emitFragment(dto)
	return &dto, nil
}

// ---------- 内部 ----------

// applyOne 就地更新 frag(状态、匹配原因、applied_at),写回数据库并 emit 事件。
// batchID 可为 0(只读片段)。
func (s *FragmentService) applyOne(convID uint64, frag *MessageFragment, batchID uint64) {
	// 已处于终态的直接跳过。
	switch frag.Status {
	case StatusApplied, StatusIgnored, StatusParseError, StatusResolved, StatusText:
		return
	}

	status, reason := s.runFragment(frag, batchID)
	now := time.Now()
	frag.Status = status
	frag.MatchReason = reason
	frag.UpdatedAt = now
	updates := map[string]any{
		"status":       status,
		"match_reason": reason,
		"updated_at":   now,
	}
	if status == StatusApplied || status == StatusResolved {
		frag.AppliedAt = &now
		updates["applied_at"] = now
	}
	if err := s.db.Model(&MessageFragment{}).
		Where("id = ?", frag.ID).
		Updates(updates).Error; err != nil {
		s.logger.Error("apply: persist", "err", err, "fragmentId", frag.ID)
		return
	}
	_ = convID
	s.emitFragment(toFragmentDTO(*frag))
}

// runFragment 只跑一条,返回目标状态 + 原因/结果 detail。
// 对 REQUEST_* 会把读取结果写回 frag.After 供 UI 显示。
func (s *FragmentService) runFragment(frag *MessageFragment, batchID uint64) (FragmentStatus, string) {
	switch frag.Kind {
	case FragmentWriteFile:
		if _, err := s.files.Write(file.WriteFileInput{
			Path:    frag.Path,
			Content: frag.After,
			BatchID: batchID,
		}); err != nil {
			return StatusMatchFailed, err.Error()
		}
		return StatusApplied, ""
	case FragmentEditBlock:
		read, err := s.files.Read(frag.Path)
		if err != nil || read == nil {
			msg := "无法读取文件内容"
			if err != nil {
				msg = err.Error()
			}
			return StatusMatchFailed, msg
		}
		originalUsesCRLF := strings.Contains(read.Content, "\r\n")
		newContent, ok, _, reason := aiproto.ApplyEdits(read.Content, []aiproto.SearchReplaceBlock{
			{Search: frag.Before, Replace: frag.After},
		})
		if !ok {
			return StatusMatchFailed, reason
		}
		final := newContent
		if originalUsesCRLF {
			final = aiproto.NormalizeToCRLF(newContent)
		}
		if _, err := s.files.Write(file.WriteFileInput{
			Path:    frag.Path,
			Content: final,
			BatchID: batchID,
		}); err != nil {
			return StatusMatchFailed, err.Error()
		}
		return StatusApplied, ""
	case FragmentDeleteFile:
		if err := s.files.DeleteWithBatch(file.DeleteInput{Path: frag.Path, BatchID: batchID}); err != nil {
			return StatusMatchFailed, err.Error()
		}
		return StatusApplied, ""
	case FragmentMovePath:
		if err := s.files.Move(file.MovePathInput{
			Source:      frag.Path,
			Destination: frag.Destination,
			BatchID:     batchID,
		}); err != nil {
			return StatusMatchFailed, err.Error()
		}
		return StatusApplied, ""
	case FragmentCreateDirectory:
		if err := s.files.CreateDirectoryWithBatch(file.CreateDirectoryInput{
			Path:    frag.Path,
			BatchID: batchID,
		}); err != nil {
			return StatusMatchFailed, err.Error()
		}
		return StatusApplied, ""
	case FragmentRequestFile:
		res, err := s.files.Read(frag.Path)
		if err != nil {
			return StatusMatchFailed, err.Error()
		}
		if res != nil {
			frag.After = res.Content
		}
		return StatusResolved, ""
	case FragmentRequestDirectoryList:
		entries, err := s.files.List(frag.Path)
		if err != nil {
			return StatusMatchFailed, err.Error()
		}
		lines := make([]string, 0, len(entries))
		for _, e := range entries {
			prefix := "-"
			if e.IsDir {
				prefix = "d"
			}
			lines = append(lines, fmt.Sprintf("%s %s", prefix, e.Name))
		}
		frag.After = strings.Join(lines, "\n")
		return StatusResolved, ""
	default:
		return StatusMatchFailed, "unknown kind: " + string(frag.Kind)
	}
}

// ensureBatchForMessage 若 message 尚未绑定 batch,创建一个并写回 message.BatchID。
// 已绑定则返回既有 id。用于在多次应用间共享同一 snapshot batch。
func (s *FragmentService) ensureBatchForMessage(convID, messageID uint64) (uint64, error) {
	var msg Message
	if err := s.db.First(&msg, messageID).Error; err != nil {
		return 0, fmt.Errorf("fragment: load message: %w", err)
	}
	if msg.BatchID != 0 {
		return msg.BatchID, nil
	}
	var batchID uint64
	err := s.db.Transaction(func(tx *gorm.DB) error {
		batch := snapshot.SnapshotBatch{
			ConversationID: convID,
			MessageID:      messageID,
			CreatedAt:      time.Now(),
		}
		if err := tx.Create(&batch).Error; err != nil {
			return err
		}
		batchID = batch.ID
		return tx.Model(&Message{}).
			Where("id = ?", messageID).
			Update("batch_id", batchID).Error
	})
	if err != nil {
		return 0, fmt.Errorf("fragment: ensure batch: %w", err)
	}
	return batchID, nil
}

func (s *FragmentService) emitFragment(dto MessageFragmentDTO) {
	e := s.getEmitter()
	if e == nil {
		return
	}
	// 需要 conversationId 才能在前端做过滤;这里向上查一次。
	var msg Message
	if err := s.db.Select("conversation_id").First(&msg, dto.MessageID).Error; err != nil {
		s.logger.Error("emit: load message", "err", err, "messageId", dto.MessageID)
		return
	}
	e.EmitEvent(FragmentUpdatedEvent, FragmentUpdatedPayload{
		ConversationID: msg.ConversationID,
		Fragment:       dto,
	})
}

func isModifying(kind FragmentKind) bool {
	switch kind {
	case FragmentWriteFile,
		FragmentEditBlock,
		FragmentDeleteFile,
		FragmentMovePath,
		FragmentCreateDirectory:
		return true
	}
	return false
}

func toFragmentDTO(f MessageFragment) MessageFragmentDTO {
	appliedAt := ""
	if f.AppliedAt != nil {
		appliedAt = f.AppliedAt.Format(time.RFC3339)
	}
	return MessageFragmentDTO{
		ID:          f.ID,
		MessageID:   f.MessageID,
		OrderIndex:  f.OrderIndex,
		Kind:        string(f.Kind),
		Path:        f.Path,
		Destination: f.Destination,
		RawStart:    f.RawStart,
		RawEnd:      f.RawEnd,
		BlockIndex:  f.BlockIndex,
		Before:      f.Before,
		After:       f.After,
		Status:      string(f.Status),
		MatchReason: f.MatchReason,
		AppliedAt:   appliedAt,
		CreatedAt:   f.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   f.UpdatedAt.Format(time.RFC3339),
	}
}
