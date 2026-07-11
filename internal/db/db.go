package db

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Config 定义数据库初始化所需的配置项。
type Config struct {
	// Path 是 SQLite 数据库文件的绝对路径。
	Path string
}

// DB 封装 *gorm.DB,便于后续扩展(如事务管理、健康检查等)。
type DB struct {
	*gorm.DB
	logger *slog.Logger
	path   string
}

// Open 使用 glebarez/sqlite(纯 Go 驱动)初始化数据库连接。
// 会自动创建父目录,失败时返回错误,不静默吞异常。
func Open(cfg Config, logger *slog.Logger) (*DB, error) {
	if cfg.Path == "" {
		return nil, fmt.Errorf("db: empty database path")
	}

	if err := os.MkdirAll(filepath.Dir(cfg.Path), 0o755); err != nil {
		return nil, fmt.Errorf("db: create data dir: %w", err)
	}

	gdb, err := gorm.Open(sqlite.Open(cfg.Path), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("db: open sqlite %q: %w", cfg.Path, err)
	}

	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, fmt.Errorf("db: get sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(1) // SQLite 建议单写,避免锁竞争
	sqlDB.SetMaxIdleConns(1)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("db: ping: %w", err)
	}

	logger.Info("database opened", "path", cfg.Path)

	return &DB{DB: gdb, logger: logger, path: cfg.Path}, nil
}

// Close 关闭底层连接。
func (d *DB) Close() error {
	if d == nil || d.DB == nil {
		return nil
	}
	sqlDB, err := d.DB.DB()
	if err != nil {
		return fmt.Errorf("db: get sql.DB on close: %w", err)
	}
	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("db: close: %w", err)
	}
	d.logger.Info("database closed", "path", d.path)
	return nil
}

// AutoMigrate 对给定模型执行自动迁移。
func (d *DB) AutoMigrate(models ...interface{}) error {
	if len(models) == 0 {
		return nil
	}
	if err := d.DB.AutoMigrate(models...); err != nil {
		return fmt.Errorf("db: auto migrate: %w", err)
	}
	return nil
}