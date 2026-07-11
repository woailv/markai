package config

import "github.com/wailsapp/wails/v3/pkg/application"

// AppConfig 集中管理应用级常量与默认值,便于后续接入配置文件/环境变量。
type AppConfig struct {
	Name        string
	Description string
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
		Background: application.NewRGB(6, 7, 15),
	}
}