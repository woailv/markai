package logger

import (
	"log/slog"
	"os"
)

// New 返回一个标准 slog Logger,后续可替换为文件/JSON handler。
func New() *slog.Logger {
	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})
	return slog.New(handler)
}
