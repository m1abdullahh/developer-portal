---
to: internal/logging/logging.go
---
// Package logging configures slog for structured JSON output — one object per line, which is what
// every log aggregator expects. stdlib rather than a logging library: slog already produces the
// output this service needs, and a dependency that duplicates the standard library is a supply
// chain risk with no feature attached.
package logging

import (
	"log/slog"
	"os"
	"strings"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
)

func Setup(cfg *config.Config) {
	// Both spellings of each level, because LOG_LEVEL is set by the same Helm values file for
	// every service and the other two runtimes use pino's and the stdlib's vocabularies.
	var level slog.Level
	switch strings.ToLower(cfg.LogLevel) {
	case "debug", "trace":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error", "fatal", "critical":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
}
