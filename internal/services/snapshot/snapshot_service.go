package snapshot

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gorm.io/gorm"

	"prompttool/internal/db"
	"prompttool/internal/pkg/fsattr"
)

// SnapshotService 负责文件修改批次的快照登记与撤销。
// 与 FileService 之间的耦合通过导出的 RecordIfNeeded 方法实现:FileService 在实际写盘前
// 调用 SnapshotService.RecordIfNeeded 将原始内容登记为快照。
type SnapshotService struct {
	db *db.DB
}

// NewSnapshotService 构造函数。
func NewSnapshotService(database *db.DB) (*SnapshotService, error) {
	if database == nil {
		return nil, errors.New("snapshot: nil db")
	}
	return &SnapshotService{db: database}, nil
}

// ---------- 批次生命周期 ----------

// BeginBatch 开启一个空批次,返回 batchID。
// MessageID 允许为 0(尚未落库),稍后调用 Bind 绑定。
func (s *SnapshotService) BeginBatch(in BeginBatchInput) (*BeginBatchResult, error) {
	if in.ConversationID == 0 {
		return nil, errors.New("snapshot: conversation id required")
	}
	batch := SnapshotBatch{
		ConversationID: in.ConversationID,
		MessageID:      in.MessageID,
		CreatedAt:      time.Now(),
	}
	if err := s.db.Create(&batch).Error; err != nil {
		return nil, fmt.Errorf("snapshot: begin batch: %w", err)
	}
	return &BeginBatchResult{BatchID: batch.ID}, nil
}

// Bind 将批次关联到最终落库的 AI 消息 id。
func (s *SnapshotService) Bind(in BindBatchInput) error {
	if in.BatchID == 0 || in.MessageID == 0 {
		return errors.New("snapshot: batch id and message id required")
	}
	res := s.db.Model(&SnapshotBatch{}).
		Where("id = ?", in.BatchID).
		Update("message_id", in.MessageID)
	if res.Error != nil {
		return fmt.Errorf("snapshot: bind: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("snapshot: batch not found: %d", in.BatchID)
	}
	// 同步给该批次涉及的 message.batch_id(便于前端从消息即知有可撤销批次)。
	// 用 Table("messages") 而非引用 conversation.Message,避免与 conversation 包
	// 形成循环依赖(conversation 需要 SnapshotService 做级联删除)。
	if err := s.db.Table("messages").
		Where("id = ?", in.MessageID).
		Update("batch_id", in.BatchID).Error; err != nil {
		return fmt.Errorf("snapshot: mark message batch: %w", err)
	}
	return nil
}

// Status 查询一个批次的状态摘要;供前端渲染撤销入口。
func (s *SnapshotService) Status(batchID uint64) (*BatchStatus, error) {
	if batchID == 0 {
		return nil, errors.New("snapshot: batch id required")
	}
	var batch SnapshotBatch
	if err := s.db.First(&batch, batchID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("snapshot: batch not found: %d", batchID)
		}
		return nil, fmt.Errorf("snapshot: load batch: %w", err)
	}
	var count int64
	if err := s.db.Model(&FileSnapshot{}).
		Where("batch_id = ?", batchID).
		Count(&count).Error; err != nil {
		return nil, fmt.Errorf("snapshot: count files: %w", err)
	}

	stale, err := s.detectStale(batch)
	if err != nil {
		return nil, err
	}

	st := &BatchStatus{
		BatchID:      batch.ID,
		MessageID:    batch.MessageID,
		FileCount:    int(count),
		CreatedAt:    batch.CreatedAt.Format(time.RFC3339),
		StaleWarning: stale,
	}
	if batch.UndoneAt != nil {
		st.UndoneAt = batch.UndoneAt.Format(time.RFC3339)
	}
	return st, nil
}

// Undo 撤销一个批次:将其中登记的所有路径回滚到批次开启前的状态。
// 已撤销的批次再次调用将报错。
func (s *SnapshotService) Undo(batchID uint64) (*UndoBatchResult, error) {
	if batchID == 0 {
		return nil, errors.New("snapshot: batch id required")
	}
	var (
		batch SnapshotBatch
		snaps []FileSnapshot
	)
	if err := s.db.First(&batch, batchID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("snapshot: batch not found: %d", batchID)
		}
		return nil, fmt.Errorf("snapshot: load batch: %w", err)
	}
	if batch.UndoneAt != nil {
		return nil, fmt.Errorf("snapshot: batch %d already undone", batchID)
	}
	if err := s.db.
		Where("batch_id = ?", batchID).
		Order(`"order" ASC, id ASC`).
		Find(&snaps).Error; err != nil {
		return nil, fmt.Errorf("snapshot: load files: %w", err)
	}

	// 同一路径在一个批次内可能被记录多次(先写再删等),按最早那次(Order 最小)还原,
	// 因为它才代表"批次开启前"的真实状态。
	firstByPath := make(map[string]FileSnapshot, len(snaps))
	orderedPaths := make([]string, 0, len(snaps))
	for _, sn := range snaps {
		if _, ok := firstByPath[sn.Path]; ok {
			continue
		}
		firstByPath[sn.Path] = sn
		orderedPaths = append(orderedPaths, sn.Path)
	}

	result := &UndoBatchResult{BatchID: batchID}
	for _, p := range orderedPaths {
		sn := firstByPath[p]
		if err := restoreOne(sn); err != nil {
			result.Warnings = append(result.Warnings, err.Error())
			continue
		}
		result.RestoredPaths = append(result.RestoredPaths, p)
	}

	now := time.Now()
	if err := s.db.Model(&SnapshotBatch{}).
		Where("id = ?", batchID).
		Update("undone_at", &now).Error; err != nil {
		return nil, fmt.Errorf("snapshot: mark undone: %w", err)
	}
	return result, nil
}

// ---------- FileService 侧调用的方法 ----------

// RecordIfNeeded 若 batchID != 0,在实际写盘/删除/移动前登记原始内容。
// 幂等语义交给上层:同一路径可多次登记,以时间序保留;还原时用最早那次。
// 该方法供 file 域 Service 跨包调用。
func (s *SnapshotService) RecordIfNeeded(batchID uint64, absPath string) error {
	if batchID == 0 {
		return nil
	}
	// 校验批次存在且未撤销
	var batch SnapshotBatch
	if err := s.db.First(&batch, batchID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("snapshot: batch not found: %d", batchID)
		}
		return fmt.Errorf("snapshot: load batch: %w", err)
	}
	if batch.UndoneAt != nil {
		return fmt.Errorf("snapshot: batch %d already undone", batchID)
	}

	sn := FileSnapshot{
		BatchID:   batchID,
		Path:      absPath,
		CreatedAt: time.Now(),
	}

	info, err := os.Stat(absPath)
	switch {
	case err == nil:
		sn.Existed = true
		sn.IsDir = info.IsDir()
		if !info.IsDir() {
			data, readErr := os.ReadFile(absPath)
			if readErr != nil {
				return fmt.Errorf("snapshot: read %q: %w", absPath, readErr)
			}
			sn.Content = data
		}
	case errors.Is(err, os.ErrNotExist):
		sn.Existed = false
	default:
		return fmt.Errorf("snapshot: stat %q: %w", absPath, err)
	}

	// order = 当前批次已有条数
	var count int64
	if err := s.db.Model(&FileSnapshot{}).
		Where("batch_id = ?", batchID).
		Count(&count).Error; err != nil {
		return fmt.Errorf("snapshot: count existing: %w", err)
	}
	sn.Order = int(count)

	if err := s.db.Create(&sn).Error; err != nil {
		return fmt.Errorf("snapshot: record %q: %w", absPath, err)
	}
	return nil
}

// ---------- 跨域清理:供 conversation 层调用 ----------

// DeleteBatchTx 在给定事务中删除单个批次及其快照文件。
// 由 ConversationService.DeleteMessage 在删除关联消息时调用。
func (s *SnapshotService) DeleteBatchTx(tx *gorm.DB, batchID uint64) error {
	if batchID == 0 {
		return errors.New("snapshot: batch id required")
	}
	if err := tx.Where("batch_id = ?", batchID).Delete(&FileSnapshot{}).Error; err != nil {
		return fmt.Errorf("snapshot: delete files: %w", err)
	}
	if err := tx.Delete(&SnapshotBatch{}, batchID).Error; err != nil {
		return fmt.Errorf("snapshot: delete batch: %w", err)
	}
	return nil
}

// DeleteByConversationTx 在给定事务中删除某会话名下的所有批次与快照文件。
// 由 ConversationService 在删除/清空会话时调用,保持 snapshot 域自治:
// 表结构与领域规则(比如仅删数据不做撤销回滚)都由本包决定,
// conversation 不再直接触碰 snapshot_batches / file_snapshots 表。
func (s *SnapshotService) DeleteByConversationTx(tx *gorm.DB, convID uint64) error {
	if convID == 0 {
		return errors.New("snapshot: conversation id required")
	}
	var batches []SnapshotBatch
	if err := tx.Where("conversation_id = ?", convID).Find(&batches).Error; err != nil {
		return fmt.Errorf("snapshot: load batches: %w", err)
	}
	if len(batches) == 0 {
		return nil
	}
	ids := make([]uint64, 0, len(batches))
	for _, b := range batches {
		ids = append(ids, b.ID)
	}
	if err := tx.Where("batch_id IN ?", ids).Delete(&FileSnapshot{}).Error; err != nil {
		return fmt.Errorf("snapshot: delete files: %w", err)
	}
	if err := tx.Where("conversation_id = ?", convID).Delete(&SnapshotBatch{}).Error; err != nil {
		return fmt.Errorf("snapshot: delete batches: %w", err)
	}
	return nil
}

// detectStale 判断此批次涉及的路径中,是否有在此之后被其它未撤销批次覆盖过。
func (s *SnapshotService) detectStale(batch SnapshotBatch) (bool, error) {
	var paths []string
	if err := s.db.Model(&FileSnapshot{}).
		Where("batch_id = ?", batch.ID).
		Distinct("path").
		Pluck("path", &paths).Error; err != nil {
		return false, fmt.Errorf("snapshot: pluck paths: %w", err)
	}
	if len(paths) == 0 {
		return false, nil
	}
	var newer int64
	if err := s.db.Model(&FileSnapshot{}).
		Joins("JOIN snapshot_batches ON snapshot_batches.id = file_snapshots.batch_id").
		Where("file_snapshots.path IN ?", paths).
		Where("snapshot_batches.id <> ?", batch.ID).
		Where("snapshot_batches.created_at > ?", batch.CreatedAt).
		Where("snapshot_batches.undone_at IS NULL").
		Count(&newer).Error; err != nil {
		return false, fmt.Errorf("snapshot: detect stale: %w", err)
	}
	return newer > 0, nil
}

// restoreOne 按快照还原单个路径。
// - Existed=false → 若当前存在则删除
// - Existed=true & IsDir → 确保目录存在
// - Existed=true & 文件 → 覆写回原始内容
func restoreOne(sn FileSnapshot) error {
	if !sn.Existed {
		if _, err := os.Stat(sn.Path); err == nil {
			if err := os.RemoveAll(sn.Path); err != nil {
				return fmt.Errorf("restore %q (remove): %w", sn.Path, err)
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("restore %q (stat): %w", sn.Path, err)
		}
		return nil
	}
	if sn.IsDir {
		if err := os.MkdirAll(sn.Path, 0o755); err != nil {
			return fmt.Errorf("restore %q (mkdir): %w", sn.Path, err)
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(sn.Path), 0o755); err != nil {
		return fmt.Errorf("restore %q (mkdir parent): %w", sn.Path, err)
	}
	// 现文件可能是只读,先解除;失败不阻断(可能不存在,写入时再决定)
	_ = fsattr.ClearReadOnly(sn.Path)
	if err := os.WriteFile(sn.Path, sn.Content, 0o644); err != nil {
		return fmt.Errorf("restore %q (write): %w", sn.Path, err)
	}
	return nil
}
