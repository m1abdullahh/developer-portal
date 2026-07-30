---
to: <%= framework.sourceRoot %>components/ui/ui.module.css
---
/*
 * Styles for the whole primitive set.
 *
 * One module rather than eight co-located files: these components ship and are edited as a unit,
 * and splitting them duplicates the same token references eight times. Split it if a primitive
 * ever grows large enough to warrant its own file.
 *
 * Class names are local to this module — the bundler rewrites them — so short names like
 * `.button` cannot collide with anything in your application.
 */

/* ── button ─────────────────────────────────────────────────────────────── */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.button:disabled {
  pointer-events: none;
  opacity: 0.5;
}
.button:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.primary {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
.secondary {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.ghost {
  background: transparent;
  color: hsl(var(--foreground));
}
.destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
.button:hover:not(:disabled) {
  opacity: 0.9;
}

/* ── card ───────────────────────────────────────────────────────────────── */
.card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  padding: 1.25rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}

/* ── input & select ─────────────────────────────────────────────────────── */
.field {
  width: 100%;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--background));
  color: inherit;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
}
.field::placeholder {
  color: hsl(var(--muted-foreground));
}
.field:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.field:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.invalid {
  border-color: hsl(var(--destructive));
}

/* ── badge ──────────────────────────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
}
.neutral {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.success {
  background: hsl(var(--success) / 0.15);
  color: hsl(var(--success));
}
.warning {
  background: hsl(var(--warning) / 0.15);
  color: hsl(var(--warning));
}
.danger {
  background: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}
.accent {
  background: hsl(var(--accent) / 0.15);
  color: hsl(var(--accent));
}

/* ── table ──────────────────────────────────────────────────────────────── */
/* The wrapper scrolls, never the page: a wide table must not make the document scroll sideways. */
.tableWrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.th {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-bottom: 1px solid hsl(var(--border));
}
.td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
}
.right {
  text-align: right;
}
.empty {
  padding: 1.5rem 0.75rem;
  text-align: center;
  color: hsl(var(--muted-foreground));
}

/* ── dialog ─────────────────────────────────────────────────────────────── */
.dialog {
  width: 100%;
  max-width: 32rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  padding: 0;
}
.dialog::backdrop {
  background: rgb(0 0 0 / 0.5);
}
.dialogHeader {
  border-bottom: 1px solid hsl(var(--border));
  padding: 0.75rem 1.25rem;
}
.dialogTitle {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}
.dialogBody {
  padding: 1rem 1.25rem;
  font-size: 0.875rem;
}
.dialogFooter {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid hsl(var(--border));
  padding: 0.75rem 1.25rem;
}

/* ── toast ──────────────────────────────────────────────────────────────── */
.toastRegion {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  width: 20rem;
  flex-direction: column;
  gap: 0.5rem;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
.toastMessage {
  flex: 1;
}
.dismiss {
  border: 0;
  background: none;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
