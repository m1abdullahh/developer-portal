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
-- with an Up section and a Down section that actually reverses it, marked with the two goose
-- annotations exactly as below. Apply with `go run ./cmd/migrate`. goose records applied versions
-- in the goose_db_version table, so each file runs exactly once per database.
--
-- Keep the word "goose" with a plus sign out of every other comment line: goose reads
-- annotations from comments anywhere in the file, and a comment that merely mentions one made
-- this very file unparseable — the migration runner failed on a freshly scaffolded project.

-- +goose Up
SELECT 1;

-- +goose Down
SELECT 1;
