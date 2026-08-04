---
to: cmd/migrate/main.go
---
// The migration runner: `go run ./cmd/migrate`.
//
// A separate binary rather than a flag on the API, so a Kubernetes Job or CI step can apply
// migrations with no HTTP server attached — and so the API image never contains a code path that
// alters the schema.
package main

import (
	"log/slog"
	"os"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/db"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(1)
	}

	if err := db.Open(cfg); err != nil {
		slog.Error("could not open the database", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Migrate(); err != nil {
		slog.Error("migrations failed", "err", err)
		os.Exit(1)
	}

	slog.Info("migrations applied")
}
