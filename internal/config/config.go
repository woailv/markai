package config

import (
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AppConfig 集中管理应用级常量与默认值,便于后续接入配置文件/环境变量。
type AppConfig struct {
	Name        string
	Description string
}

// DBConfig 数据库相关默认配置。
type DBConfig struct {
	// Path SQLite 数据库文件绝对路径。
	Path string
}

// WindowConfig 主窗口默认参数。
type WindowConfig struct {
	Title      string
	Width      int
	Height     int
	Background application.RGBA
}

// Default 返回默认应用配置。
func Default() AppConfig {
	return AppConfig{
		Name:        "prompttool",
		Description: "A demo of using raw HTML & CSS",
	}
}

// DefaultWindow 返回默认主窗口配置。
func DefaultWindow() WindowConfig {
	return WindowConfig{
		Title:      "Window 1",
		Width:      1000,
		Height:     618,
		Background: application.NewRGB(255, 255, 255),
	}
}

// DefaultDB 返回默认数据库配置。
// 优先使用用户配置目录 (~/.config/prompttool 或 %AppData%\prompttool),
// 获取失败时回退到当前工作目录。
func DefaultDB() DBConfig {
	const fileName = "prompttool.db"

	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		return DBConfig{Path: filepath.Join(".", "data", fileName)}
	}
	return DBConfig{Path: filepath.Join(dir, "prompttool", fileName)}
}
