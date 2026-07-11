package main

import (
	"embed"
	"os"

	"prompttool/internal/app"
	"prompttool/internal/logger"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	app.RegisterEvents()
}

func main() {
	log := logger.New()

	a, err := app.New(assets, log)
	if err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
	if err := a.Run(); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}