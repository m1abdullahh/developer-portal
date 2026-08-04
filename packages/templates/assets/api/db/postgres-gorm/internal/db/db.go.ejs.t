---
to: internal/db/db.go
---
// Package db owns the connection, the readiness check and the migrations.
package db

import (
	"context"
	"embed"
	"fmt"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
)

//go:embed migrations/*.sql
var migrations embed.FS

var handle *gorm.DB

// Open connects lazily, on purpose.
//
// DisableAutomaticPing is the load-bearing option: without it gorm dials the database at Open,
// and a service that cannot boot without its database turns every database blip into a crash
// loop. The whole /health-versus-/ready split exists so that boot never requires the database —
// /ready reports it, /health does not, and Kubernetes acts on the difference.
func Open(cfg *config.Config) error {
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		DisableAutomaticPing: true,
	})
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("access connection pool: %w", err)
	}

	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(5)
	// Recycle before most managed Postgres services and load balancers drop an idle connection.
	// Without this the first query after a quiet period fails with a server-closed error, once
	// per connection — the classic "it only breaks in the morning" bug.
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	handle = db
	return nil
}

// Handle returns the connection for queries. Nil before Open — which in a correctly-wired main
// cannot happen, because Open runs in the startup region before the server accepts traffic.
func Handle() *gorm.DB {
	return handle
}

// Check is used by /ready, and deliberately not by /health.
func Check(ctx context.Context) error {
	if handle == nil {
		return fmt.Errorf("database is not open")
	}

	sqlDB, err := handle.DB()
	if err != nil {
		return err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return sqlDB.PingContext(pingCtx)
}

// Migrate applies the embedded goose migrations, run from cmd/migrate rather than at boot.
//
// A deliberate step, matching the Prisma and Alembic posture: migrations reaching production
// because a pod restarted is how a bad migration gets applied at 3am with nobody watching.
func Migrate() error {
	if handle == nil {
		return fmt.Errorf("database is not open")
	}

	sqlDB, err := handle.DB()
	if err != nil {
		return err
	}

	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(sqlDB, "migrations")
}

// Close disposes the pool on shutdown. Without it every rolling update leaks connections until
// the server times them out — and the symptom appears on a different pod, as an inability to
// connect once the database's connection limit fills.
func Close() {
	if handle == nil {
		return
	}
	if sqlDB, err := handle.DB(); err == nil {
		_ = sqlDB.Close()
	}
}
