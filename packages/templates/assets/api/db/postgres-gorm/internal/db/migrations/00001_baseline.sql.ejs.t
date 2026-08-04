---
to: internal/db/migrations/00001_baseline.sql
---
-- The baseline migration. It exists because the migrations are embedded in the binary with
-- go:embed, and an embed pattern that matches no files is a compile error — the very first build
-- of a freshly scaffolded project would fail with a message about a directory, not about
-- migrations.
--
-- Real schema changes get their own numbered file:
--
--   internal/db/migrations/00002_create_widgets.sql
--
-- with a `-- +goose Up` section and a `-- +goose Down` that actually reverses it. Apply with
-- `go run ./cmd/migrate`. goose records applied versions in the goose_db_version table, so each
-- file runs exactly once per database.

-- +goose Up
SELECT 1;

-- +goose Down
SELECT 1;
