/**
 * Golden-file snapshots.
 *
 * Every other test here asserts a *property* — this recipe contributes that dependency, this
 * marker lands in that order. Those catch what we thought to ask about. A snapshot catches what
 * we did not: an EJS change that quietly reorders a file, a dependency bump that rewrites a
 * lockfile-adjacent line, a codemod that starts emitting a trailing newline.
 *
 * The diff *is* the review. When one of these fails, the question is never "why is the test
 * broken" but "is this change intended" — which is exactly the conversation a template change
 * deserves before it reaches somebody's repository.
 *
 * Two levels, deliberately:
 *
 *   - A **manifest** of every path with a content hash. Cheap to read in a diff, and it makes
 *     an accidental file addition or removal impossible to miss.
 *   - **Full text** for the handful of files nobody would hand-check but everybody depends on —
 *     the Dockerfile, the CI workflow, the composed server entrypoint.
 *
 * Update with `npx vitest run --root packages/generator golden -u`, and read the diff.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  apiOnlyGoSpec,
  apiOnlyPythonSpec,
  spineSpec,
  uiOnlyVercelSpec,
  type ProjectSpec,
} from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import type { VirtualFile } from './types.js';

const cache = new Map<ProjectSpec, ReturnType<typeof runPipeline>>();

async function generate(spec: ProjectSpec) {
  let result = cache.get(spec);
  if (!result) {
    result = runPipeline(spec, { registry: createRegistry() });
    cache.set(spec, result);
  }
  return result;
}

function text(file: VirtualFile): string {
  return typeof file.content === 'string' ? file.content : `<binary ${file.content.length}b>`;
}

/** Short content hash — long enough to be unambiguous, short enough to read in a diff. */
function digest(file: VirtualFile): string {
  return createHash('sha256').update(text(file)).digest('hex').slice(0, 12);
}

/**
 * A stable, human-readable inventory of the tree.
 *
 * Sorted by path so recipe registration order cannot reorder it — the pipeline is already
 * order-independent, and this asserts that stays true.
 */
function manifest(files: readonly VirtualFile[]): string {
  return [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${digest(file)}  ${file.path}`)
    .join('\n');
}

/** Files where the exact bytes matter enough to review them line by line. */
const FULL_TEXT = [
  '.github/workflows/ci.yml',
  '.github/workflows/cd.yml',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  'apps/api/src/server.ts',
  'apps/api/src/config/env.ts',
  'deploy/values.yaml',
  'docker-compose.yml',
];

const MATRIX: Array<{ name: string; spec: ProjectSpec }> = [
  { name: 'spine', spec: spineSpec() },
  { name: 'ui-only', spec: uiOnlyVercelSpec() },
  { name: 'api-only-python', spec: apiOnlyPythonSpec() },
  { name: 'api-only-go', spec: apiOnlyGoSpec() },
];

describe.each(MATRIX)('golden — $name', ({ name, spec }) => {
  it('file manifest', async () => {
    const { files } = await generate(spec);
    await expect(manifest(files)).toMatchFileSnapshot(`./__snapshots__/${name}.manifest.txt`);
  });

  it('post-install instructions', async () => {
    const { postInstall } = await generate(spec);
    expect(postInstall).toMatchSnapshot();
  });
});

describe('golden — spine file contents', () => {
  // Only the spine gets full-text snapshots. Doing it for every combination would triple the
  // review surface without tripling the information: the other shapes differ by which files
  // exist, which the manifest already captures.
  it.each(FULL_TEXT)('%s', async (path) => {
    const { files } = await generate(spineSpec());
    const file = files.find((f) => f.path === path);

    expect(file, `${path} is missing from the generated tree`).toBeDefined();
    await expect(text(file!)).toMatchFileSnapshot(
      `./__snapshots__/spine/${path.replace(/[/\\]/g, '__')}.txt`,
    );
  });
});

describe('the snapshots are meaningful', () => {
  /**
   * A snapshot suite that silently covers nothing is worse than none at all. If the spine ever
   * stops producing a substantial tree, these numbers fail before the snapshots do — with a far
   * clearer message than a diff of two empty files.
   */
  it('covers a substantial tree', async () => {
    const { files } = await generate(spineSpec());

    expect(files.length).toBeGreaterThan(50);
    expect(manifest(files).split('\n')).toHaveLength(files.length);
  });

  it('hashes distinguish content, not just paths', async () => {
    const a: VirtualFile = { path: 'x', content: 'one', producedBy: 't' };
    const b: VirtualFile = { path: 'x', content: 'two', producedBy: 't' };

    expect(digest(a)).not.toBe(digest(b));
  });

  // Determinism is what makes a snapshot suite viable at all: a tree that differs between runs
  // would fail on every unrelated commit and be deleted within a week.
  it('is stable across repeated generation', async () => {
    const first = await runPipeline(spineSpec(), { registry: createRegistry() });
    const second = await runPipeline(spineSpec(), { registry: createRegistry() });

    expect(manifest(second.files)).toBe(manifest(first.files));
  });
});
