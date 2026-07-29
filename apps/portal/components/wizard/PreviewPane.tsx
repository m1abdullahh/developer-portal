'use client';

import { useEffect, useRef, useState } from 'react';
import { toSpec, useWizard } from '../../lib/wizard-store';
import { Badge, Banner, Card } from '../ui';

interface PreviewFile {
  label: string;
  path: string;
  lang: string;
  content: string;
}

interface PreviewResponse {
  files: PreviewFile[];
  fileCount: number;
  durationMs: number;
  note?: string;
  error?: string;
}

/**
 * Live preview of the DevOps output (doc 04 §6).
 *
 * The point of this pane is trust. Step 4 asks people to make decisions about containers,
 * Kubernetes and CI whose consequences are invisible until a repository already exists — so it
 * shows the actual rendered Dockerfile, Helm chart and workflows *before* committing to them.
 *
 * It runs the real pipeline server-side, not a simplified imitation, so what appears here is
 * byte-for-byte what gets pushed.
 */
export function PreviewPane() {
  const state = useWizard();
  const { meta, ui, api, ops } = state;

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    // Debounced: rendering is real work — a full resolve, render, merge, codemod and format pass —
    // and dragging a replica-count slider should not queue one per pixel.
    const timer = setTimeout(() => {
      const id = ++requestId.current;
      setPending(true);

      fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toSpec(state)),
      })
        .then((r) => r.json())
        .then((body: PreviewResponse) => {
          // Out-of-order responses would flicker between stale and current output.
          if (id !== requestId.current) return;
          if (body.error) {
            setError(body.error);
          } else {
            setError(null);
            setPreview(body);
            setSelected((current) => Math.min(current, Math.max(0, body.files.length - 1)));
          }
        })
        .catch((cause: unknown) => {
          if (id !== requestId.current) return;
          setError(cause instanceof Error ? cause.message : 'Preview failed.');
        })
        .finally(() => {
          if (id === requestId.current) setPending(false);
        });
    }, 600);

    return () => clearTimeout(timer);
    // Deliberately keyed on the spec's content, not the whole store: `step` and transient UI
    // state change far more often and must not trigger a re-render of the project.
  }, [meta, ui, api, ops]);

  const file = preview?.files[selected];

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Rendered by the same pipeline that provisions the repository.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pending ? <Badge tone="accent">rendering…</Badge> : null}
          {preview ? <Badge>{preview.fileCount} files</Badge> : null}
        </div>
      </div>

      {preview?.note ? <Banner tone="warning">{preview.note}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {preview && preview.files.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {preview.files.map((f, index) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelected(index)}
                className={[
                  'focus-ring rounded-full border px-2.5 py-1 text-xs transition-colors',
                  index === selected
                    ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                    : 'hover:bg-[hsl(var(--muted))]',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>

          {file ? (
            <div className="space-y-1">
              <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                {file.path}
              </p>
              <pre className="max-h-[28rem] overflow-auto rounded-[var(--radius)] border bg-[hsl(var(--muted))] p-3 text-[11px] leading-relaxed">
                {file.content}
              </pre>
            </div>
          ) : null}
        </>
      ) : !error && !pending ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          No previewable files for this configuration — a project with no container and no
          Kubernetes produces none.
        </p>
      ) : null}
    </Card>
  );
}
