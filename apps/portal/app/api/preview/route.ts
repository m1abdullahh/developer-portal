/**
 * Renders a spec without provisioning anything.
 *
 * This is only possible because the pipeline is filesystem-free by design: `runPipeline` returns
 * an in-memory tree and emission is the caller's job (doc 05). Preview is therefore the *same*
 * code path the real provision takes, not a second renderer that could drift from it — what you
 * see here is what gets pushed.
 *
 * Requests are validated leniently: the wizard asks for a preview from step 4, long before the
 * spec is complete, so a partial spec is filled with defaults rather than rejected.
 */

import { CURRENT_SPEC_VERSION, safeParseProjectSpec, spineSpec, type ProjectSpec } from '@idp/core';
import { createRegistry, runPipeline, type VirtualFile } from '@idp/generator';
import { authErrorResponse, requireUser } from '../../../lib/session';

export const dynamic = 'force-dynamic';

/**
 * Files worth previewing, in the order they are offered.
 *
 * Deliberately the ones nobody wants to hand-write and everybody wants to check before
 * committing to a stack — the DevOps output the PRD is really about (doc 04 §6).
 */
const PREVIEW_FILES = [
  { label: 'Dockerfile (web)', match: /^(apps\/web\/)?Dockerfile$/, lang: 'dockerfile' },
  { label: 'Dockerfile (api)', match: /^(apps\/api\/)?Dockerfile$/, lang: 'dockerfile' },
  { label: 'Helm values', match: /^deploy\/values\.yaml$/, lang: 'yaml' },
  { label: 'Helm deployment', match: /^deploy\/templates\/deployment\.yaml$/, lang: 'yaml' },
  { label: 'ArgoCD application', match: /^gitops\/application-dev\.yaml$/, lang: 'yaml' },
  { label: 'CI workflow', match: /^\.github\/workflows\/ci\.yml$/, lang: 'yaml' },
  { label: 'CD workflow', match: /^\.github\/workflows\/cd\.yml$/, lang: 'yaml' },
  { label: 'docker-compose', match: /^docker-compose\.yml$/, lang: 'yaml' },
] as const;

export interface PreviewFile {
  label: string;
  path: string;
  lang: string;
  content: string;
}

export interface PreviewResponse {
  files: PreviewFile[];
  fileCount: number;
  durationMs: number;
  /** Present when the submitted spec could not be parsed and a default was substituted. */
  note?: string;
}

/** Bounded so one preview cannot ship a whole project down the wire. */
const MAX_PREVIEW_BYTES = 40_000;

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);

  // A spec still being edited will not parse — the wizard previews from step 4, where step 1 may
  // still be blank. Falling back to a valid spec of the same *shape* keeps the pane useful
  // instead of showing an error until the very last field is filled.
  const parsed = safeParseProjectSpec(body);
  let spec: ProjectSpec;
  let note: string | undefined;

  if (parsed.success) {
    spec = parsed.data;
  } else {
    spec = coerce(body);
    note = 'Previewing with placeholder values — some fields are not filled in yet.';
  }

  try {
    const result = await runPipeline(spec, { registry: createRegistry() });

    const files: PreviewFile[] = [];
    for (const candidate of PREVIEW_FILES) {
      const file = result.files.find((f) => candidate.match.test(f.path));
      if (!file) continue;
      // Two entries can match the same file in a single-layer project (the flat `Dockerfile`
      // matches both web and api patterns); show it once.
      if (files.some((f) => f.path === file.path)) continue;

      files.push({
        label: candidate.label,
        path: file.path,
        lang: candidate.lang,
        content: truncate(file),
      });
    }

    return Response.json({
      files,
      fileCount: result.files.length,
      durationMs: result.durationMs,
      ...(note ? { note } : {}),
    } satisfies PreviewResponse);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Preview failed.' },
      { status: 422 },
    );
  }
}

function truncate(file: VirtualFile): string {
  const content = typeof file.content === 'string' ? file.content : '(binary)';
  return content.length > MAX_PREVIEW_BYTES
    ? `${content.slice(0, MAX_PREVIEW_BYTES)}\n… truncated`
    : content;
}

/**
 * Fills an incomplete spec with defaults so it renders.
 *
 * Layer shape is preserved — a UI-only draft must preview as UI-only, since that is exactly the
 * decision the pane exists to inform.
 */
function coerce(body: unknown): ProjectSpec {
  const draft = (body ?? {}) as Partial<ProjectSpec>;
  const base = spineSpec();

  return (
    safeParseProjectSpec({
      specVersion: CURRENT_SPEC_VERSION,
      meta: { ...base.meta, ...draft.meta, repo: { ...base.meta.repo, ...draft.meta?.repo } },
      ui: draft.ui === null ? null : { ...base.ui!, ...draft.ui },
      api: draft.api === null ? null : { ...base.api!, ...draft.api },
      ops: draft.ops ? { ...base.ops, ...draft.ops } : base.ops,
    }).data ?? base
  );
}
