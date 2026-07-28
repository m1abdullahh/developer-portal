/**
 * Repository layout.
 *
 * A spec can select a UI, an API, or both. When it selects both, they are two separate
 * deployables — separate Dockerfiles, separate images, separate Kubernetes Deployments — so
 * they cannot share a project root.
 *
 * npm workspaces are deliberately NOT the general answer: the API runtime may be Python or Go,
 * and a Node workspace root would be meaningless there. Instead both layers get a directory,
 * and each stays a self-contained project that its own toolchain understands.
 *
 *   ui only     ->  /package.json, /app, ...
 *   api only    ->  /package.json, /src, ...
 *   both        ->  /apps/web/...  and  /apps/api/...
 *
 * Single-layer projects stay flat: nesting a lone Next.js app under apps/web/ would be pure
 * ceremony, and `npm install` at the root is what every developer tries first.
 */

import type { ProjectSpec } from '@idp/core';

/** Which part of the generated project a recipe contributes to. */
export type RecipeLayer = 'ui' | 'api' | 'ops' | 'root';

export interface RepoLayout {
  /** Path prefix for UI files — '' or 'apps/web/'. */
  ui: string;
  /** Path prefix for API files — '' or 'apps/api/'. */
  api: string;
  /** Ops artefacts (Dockerfile, chart, workflows) always live at the root. */
  ops: string;
  root: string;
  /** True when both layers are present and therefore nested. */
  isMonorepo: boolean;
}

export function computeLayout(spec: ProjectSpec): RepoLayout {
  const bothLayers = spec.ui !== null && spec.api !== null;

  return {
    ui: bothLayers ? 'apps/web/' : '',
    api: bothLayers ? 'apps/api/' : '',
    ops: '',
    root: '',
    isMonorepo: bothLayers,
  };
}

/** Resolves the prefix for a recipe's layer. */
export function prefixFor(layout: RepoLayout, layer: RecipeLayer = 'root'): string {
  return layout[layer];
}

/**
 * Applies a layer prefix to a path.
 *
 * Paths that are already absolute-from-root by nature — CI workflows, the chart, the compose
 * file — are exempt. A recipe declaring `layer: 'ui'` still needs to be able to contribute
 * `.github/workflows/ci.yml` without it landing in apps/web/.
 */
const ROOT_ANCHORED =
  /^(\.github\/|deploy\/|gitops\/|infra\/|docker-compose|\.gitignore$|README\.md$|SECRETS\.md$|LICENSE$)/;

export function applyPrefix(prefix: string, filePath: string): string {
  if (prefix === '' || ROOT_ANCHORED.test(filePath)) return filePath;
  return `${prefix}${filePath}`;
}
