package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"prompttool/internal/db"
)

// RecentService 负责记录、查询、清理"最近打开"条目,
// 并在数据变更后通过 Emitter 通知前端刷新。
type RecentService struct {
	db      *db.DB
	mu      sync.RWMutex
	emitter Emitter
}

// NewRecentService 构造 RecentService。调用方需负责执行 AutoMigrate(&RecentItem{})。
func NewRecentService(database *db.DB) (*RecentService, error) {
	if database == nil || database.DB == nil {
		return nil, errors.New("recent: database is required")
	}
	return &RecentService{db: database}, nil
}

// SetEmitter 由 app 层注入事件推送能力。
func (s *RecentService) SetEmitter(e Emitter) {
	s.mu.Lock()
	s.emitter = e
	s.mu.Unlock()
}

// Record 规范化路径后 upsert 一条最近打开记录。
// - 存在则更新 OpenedAt=now;不存在则新建;
// - 超过 RecentMaxItems 时删除最老记录;
// - 成功后推送 RecentEventChanged 事件。
func (s *RecentService) Record(path string) (*RecentItem, error) {
	norm, err := normalizeRecentPath(path)
	if err != nil {
		return nil, err
	}
	st, err := os.Stat(norm)
	if err != nil {
		return nil, fmt.Errorf("recent: stat %q: %w", norm, err)
	}
	kind := RecentKindFile
	if st.IsDir() {
		kind = RecentKindDir
	}

	now := time.Now()
	var item RecentItem
	txErr := s.db.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Where("path = ?", norm).First(&item)
		if res.Error != nil && !errors.Is(res.Error, gorm.ErrRecordNotFound) {
			return fmt.Errorf("recent: query: %w", res.Error)
		}
		if errors.Is(res.Error, gorm.ErrRecordNotFound) {
			item = RecentItem{Path: norm, Kind: kind, OpenedAt: now}
			if err := tx.Create(&item).Error; err != nil {
				return fmt.Errorf("recent: create: %w", err)
			}
		} else {
			item.Kind = kind
			item.OpenedAt = now
			if err := tx.Save(&item).Error; err != nil {
				return fmt.Errorf("recent: update: %w", err)
			}
		}
		// 超额裁剪:按 OpenedAt 升序,保留最新 RecentMaxItems 条。
		var total int64
		if err := tx.Model(&RecentItem{}).Count(&total).Error; err != nil {
			return fmt.Errorf("recent: count: %w", err)
		}
		if total > int64(RecentMaxItems) {
			excess := total - int64(RecentMaxItems)
			var olds []RecentItem
			if err := tx.Order("opened_at ASC").Limit(int(excess)).Find(&olds).Error; err != nil {
				return fmt.Errorf("recent: find old: %w", err)
			}
			if len(olds) > 0 {
				ids := make([]uint, 0, len(olds))
				for _, o := range olds {
					ids = append(ids, o.ID)
				}
				if err := tx.Delete(&RecentItem{}, ids).Error; err != nil {
					return fmt.Errorf("recent: prune: %w", err)
				}
			}
		}
		return nil
	})
	if txErr != nil {
		return nil, txErr
	}
	s.emitChanged()
	return &item, nil
}

// List 返回按 OpenedAt 降序排列的最近条目。
func (s *RecentService) List(in ListRecentInput) ([]RecentItem, error) {
	q := s.db.DB.Model(&RecentItem{}).Order("opened_at DESC").Limit(RecentMaxItems)
	var items []RecentItem
	if err := q.Find(&items).Error; err != nil {
		return nil, fmt.Errorf("recent: list: %w", err)
	}
	// 失效检测:路径不存在的自动删除。
	survivors := make([]RecentItem, 0, len(items))
	staleIDs := make([]uint, 0)
	for _, it := range items {
		if _, err := os.Stat(it.Path); err != nil {
			if os.IsNotExist(err) {
				staleIDs = append(staleIDs, it.ID)
				continue
			}
			// 其他错误(权限等)保留,避免误删。
		}
		survivors = append(survivors, it)
	}
	if len(staleIDs) > 0 {
		if err := s.db.DB.Delete(&RecentItem{}, staleIDs).Error; err != nil {
			return nil, fmt.Errorf("recent: prune stale: %w", err)
		}
		s.emitChanged()
	}
	return survivors, nil
}

// Remove 根据 ID 删除一条记录。
func (s *RecentService) Remove(in RemoveRecentInput) error {
	if in.ID == 0 {
		return errors.New("recent: id required")
	}
	res := s.db.DB.Delete(&RecentItem{}, in.ID)
	if res.Error != nil {
		return fmt.Errorf("recent: remove: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("recent: id %d not found", in.ID)
	}
	s.emitChanged()
	return nil
}

// Clear 清空最近记录。
func (s *RecentService) Clear(in ClearRecentInput) error {
	if err := s.db.DB.Where("1 = 1").Delete(&RecentItem{}).Error; err != nil {
		return fmt.Errorf("recent: clear: %w", err)
	}
	s.emitChanged()
	return nil
}

// emitChanged 广播变更事件。emitter 未注入时静默。
func (s *RecentService) emitChanged() {
	s.mu.RLock()
	e := s.emitter
	s.mu.RUnlock()
	if e == nil {
		return
	}
	e.EmitEvent(RecentEventChanged, nil)
}

// normalizeRecentPath 将输入路径转换为绝对、Clean 后的规范形式。
// Windows 下将盘符统一为小写,便于唯一约束匹配。
func normalizeRecentPath(path string) (string, error) {
	p := strings.TrimSpace(path)
	if p == "" {
		return "", errors.New("recent: path required")
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", fmt.Errorf("recent: abs %q: %w", p, err)
	}
	abs = filepath.Clean(abs)
	if runtime.GOOS == "windows" && len(abs) >= 2 && abs[1] == ':' {
		abs = strings.ToLower(abs[:1]) + abs[1:]
	}
	return abs, nil
}