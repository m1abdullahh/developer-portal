import { describe, expect, it } from 'vitest';
import { apiOnlyGoSpec, spineSpec, uiOnlyVercelSpec } from '@idp/core';
import { applyPrefix, computeLayout, prefixFor } from './layout.js';

describe('computeLayout', () => {
  // Nesting a lone Next.js app under apps/web/ would be pure ceremony, and `npm install` at
  // the root is what every developer tries first.
  it('keeps a UI-only project flat', () => {
    const layout = computeLayout(uiOnlyVercelSpec());
    expect(layout.isMonorepo).toBe(false);
    expect(layout.ui).toBe('');
  });

  it('keeps an API-only project flat', () => {
    const layout = computeLayout(apiOnlyGoSpec());
    expect(layout.isMonorepo).toBe(false);
    expect(layout.api).toBe('');
  });

  // Two layers are two deployables — separate images, separate Deployments — so they cannot
  // share a project root.
  it('nests both layers when a project has a UI and an API', () => {
    const layout = computeLayout(spineSpec());
    expect(layout.isMonorepo).toBe(true);
    expect(layout.ui).toBe('apps/web/');
    expect(layout.api).toBe('apps/api/');
  });

  it('always keeps ops artefacts at the root', () => {
    expect(computeLayout(spineSpec()).ops).toBe('');
    expect(computeLayout(uiOnlyVercelSpec()).ops).toBe('');
  });
});

describe('prefixFor', () => {
  it('resolves each layer', () => {
    const layout = computeLayout(spineSpec());
    expect(prefixFor(layout, 'ui')).toBe('apps/web/');
    expect(prefixFor(layout, 'api')).toBe('apps/api/');
    expect(prefixFor(layout, 'ops')).toBe('');
  });

  it("defaults to 'root' when a recipe declares no layer", () => {
    expect(prefixFor(computeLayout(spineSpec()))).toBe('');
  });
});

describe('applyPrefix', () => {
  it('prefixes ordinary layer files', () => {
    expect(applyPrefix('apps/web/', 'app/page.tsx')).toBe('apps/web/app/page.tsx');
  });

  it('is a no-op for a flat layout', () => {
    expect(applyPrefix('', 'app/page.tsx')).toBe('app/page.tsx');
  });

  // A UI-layer recipe must still be able to contribute a workflow without it landing in
  // apps/web/.github/, where Actions would never find it.
  it.each([
    '.github/workflows/ci.yml',
    'deploy/Chart.yaml',
    'gitops/application.yaml',
    'infra/terraform/main.tf',
    'docker-compose.yml',
    '.gitignore',
    'README.md',
    'SECRETS.md',
    'LICENSE',
  ])('never prefixes root-anchored path %s', (filePath) => {
    expect(applyPrefix('apps/web/', filePath)).toBe(filePath);
  });

  it('does prefix a file that merely resembles a root-anchored one', () => {
    expect(applyPrefix('apps/web/', 'docs/README.md')).toBe('apps/web/docs/README.md');
  });
});
