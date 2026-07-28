/**
 * End-to-end pipeline tests using synthetic recipes.
 *
 * Synthetic rather than real templates on purpose: this suite verifies the *engine* — ordering,
 * merging, codemod dispatch, verification, determinism. Real templates arrive in P1.2 and get
 * their own golden-file suite. Mixing the two would mean a template typo failing an engine test.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec } from '@idp/core';
import { RecipeRegistry } from './registry.js';
import { GenerationFailedError, runPipeline } from './pipeline.js';
import { PROVIDER_PRIORITY } from './codemod/providers.js';
import { README_ORDER } from './merge/readme.js';
import type { Recipe, StageEvent } from './types.js';

/** Minimal base recipe: owns package.json and the layout every other recipe modifies. */
const baseRecipe: Recipe = {
  id: 'base.app',
  phase: 'base',
  appliesTo: () => true,
  files: async (ctx) => [
    {
      path: 'package.json',
      content: `${JSON.stringify({ name: ctx.spec.meta.slug, version: '0.1.0' }, null, 2)}\n`,
      producedBy: 'base.app',
    },
    {
      path: 'app/layout.tsx',
      content:
        `import type { ReactNode } from 'react';\n\n` +
        `export default function RootLayout({ children }: { children: ReactNode }) {\n` +
        `  return <html><body>{children}</body></html>;\n}\n`,
      producedBy: 'base.app',
    },
    {
      path: 'src/server.ts',
      content: `export function start() {\n  // >>> idp:middleware\n  // <<< idp:middleware\n}\n`,
      producedBy: 'base.app',
    },
  ],
  packageJson: () => ({ dependencies: { react: '19.2.8' }, scripts: { build: 'next build' } }),
  readme: () => ({
    order: README_ORDER.gettingStarted,
    heading: 'Getting Started',
    body: 'Run it.',
  }),
};

const themeRecipe: Recipe = {
  id: 'feature.theme',
  phase: 'feature',
  appliesTo: () => true,
  packageJson: () => ({ dependencies: { tailwindcss: '4.3.3' } }),
  codemods: () => [
    {
      file: 'app/layout.tsx',
      kind: 'wrapProvider',
      args: {
        component: 'ThemeProvider',
        priority: PROVIDER_PRIORITY.theme,
        import: { module: '@/theme', named: ['ThemeProvider'] },
      },
    },
  ],
};

const authRecipe: Recipe = {
  id: 'feature.auth',
  phase: 'feature',
  appliesTo: () => true,
  packageJson: () => ({ dependencies: { react: '19.2.8' } }),
  env: () => [
    {
      key: 'JWT_SECRET',
      example: '',
      required: true,
      description: 'Token signing key',
      secret: true,
    },
    { key: 'PORT', example: '3000', required: false, description: 'HTTP port' },
  ],
  codemods: () => [
    {
      file: 'app/layout.tsx',
      kind: 'wrapProvider',
      args: {
        component: 'AuthProvider',
        priority: PROVIDER_PRIORITY.auth,
        import: { module: '@/auth', named: ['AuthProvider'] },
      },
    },
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'middleware',
        lines: ['registerAuth(app);'],
        priority: 50,
        recipeId: 'feature.auth',
      },
    },
  ],
};

function registry(...recipes: Recipe[]) {
  return new RecipeRegistry().registerAll(recipes);
}

describe('pipeline — happy path', () => {
  it('produces a complete tree from a valid spec', async () => {
    const result = await runPipeline(spineSpec(), {
      registry: registry(baseRecipe, themeRecipe, authRecipe),
    });

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('app/layout.tsx');
    expect(paths).toContain('README.md');
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('SECRETS.md');
  });

  it('merges dependencies from every recipe into package.json', async () => {
    const result = await runPipeline(spineSpec(), {
      registry: registry(baseRecipe, themeRecipe, authRecipe),
    });
    const pkg = JSON.parse(
      result.files.find((f) => f.path === 'package.json')!.content as string,
    ) as { dependencies: Record<string, string>; name: string };

    expect(pkg.name).toBe('acme-health-backend');
    expect(pkg.dependencies['react']).toBe('19.2.8');
    expect(pkg.dependencies['tailwindcss']).toBe('4.3.3');
  });

  it('nests providers by priority, not by recipe order', async () => {
    const result = await runPipeline(spineSpec(), {
      registry: registry(baseRecipe, authRecipe, themeRecipe),
    });
    const layout = result.files.find((f) => f.path === 'app/layout.tsx')!.content as string;

    expect(layout.indexOf('<ThemeProvider>')).toBeLessThan(layout.indexOf('<AuthProvider>'));
  });

  it('applies marker insertions', async () => {
    const result = await runPipeline(spineSpec(), {
      registry: registry(baseRecipe, authRecipe),
    });
    const server = result.files.find((f) => f.path === 'src/server.ts')!.content as string;
    expect(server).toContain('registerAuth(app);');
  });

  it('writes secrets to SECRETS.md and leaves the env value blank', async () => {
    const result = await runPipeline(spineSpec(), { registry: registry(baseRecipe, authRecipe) });
    const envFile = result.files.find((f) => f.path === '.env.example')!.content as string;
    const secrets = result.files.find((f) => f.path === 'SECRETS.md')!.content as string;

    expect(envFile).toMatch(/^JWT_SECRET=$/m);
    expect(envFile).toContain('PORT=3000');
    expect(secrets).toContain('JWT_SECRET');
  });

  it('reports duration and emits stage events in order', async () => {
    const events: StageEvent[] = [];
    const result = await runPipeline(spineSpec(), {
      registry: registry(baseRecipe),
      onProgress: (e) => events.push(e),
    });

    const stages = events.filter((e) => e.type === 'stage' && e.status === 'done');
    expect(stages.map((e) => (e as { stage: string }).stage)).toEqual([
      'resolve',
      'plan',
      'render',
      'merge',
      'codemod',
      'format',
      'verify',
    ]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('pipeline — determinism', () => {
  // Golden-file testing is only viable if this holds (doc 05 §6).
  it('produces byte-identical output across 20 runs', async () => {
    const run = () =>
      runPipeline(spineSpec(), { registry: registry(baseRecipe, themeRecipe, authRecipe) });

    const first = await run();
    const signature = (r: Awaited<ReturnType<typeof run>>) =>
      JSON.stringify(r.files.map((f) => [f.path, f.content]));

    for (let i = 0; i < 20; i++) {
      expect(signature(await run())).toBe(signature(first));
    }
  });

  it('is unaffected by recipe registration order', async () => {
    const a = await runPipeline(spineSpec(), {
      registry: registry(baseRecipe, themeRecipe, authRecipe),
    });
    const b = await runPipeline(spineSpec(), {
      registry: registry(authRecipe, themeRecipe, baseRecipe),
    });

    expect(a.files.map((f) => [f.path, f.content])).toEqual(
      b.files.map((f) => [f.path, f.content]),
    );
  });
});

describe('pipeline — failure handling', () => {
  it('rejects an invalid spec at the resolve stage', async () => {
    await expect(
      runPipeline({ nonsense: true }, { registry: registry(baseRecipe) }),
    ).rejects.toThrow();
  });

  it('fails verification when a template leaves unrendered EJS', async () => {
    const broken: Recipe = {
      id: 'base.broken',
      phase: 'base',
      appliesTo: () => true,
      files: async () => [
        { path: 'package.json', content: '{}\n', producedBy: 'base.broken' },
        { path: 'src/a.ts', content: 'const x = <%= oops %>;\n', producedBy: 'base.broken' },
      ],
    };

    await expect(runPipeline(spineSpec(), { registry: registry(broken) })).rejects.toThrow(
      GenerationFailedError,
    );
  });

  it('fails verification when output contains a credential-shaped literal', async () => {
    const leaky: Recipe = {
      id: 'base.leaky',
      phase: 'base',
      appliesTo: () => true,
      files: async () => [
        { path: 'package.json', content: '{}\n', producedBy: 'base.leaky' },
        {
          path: 'src/config.ts',
          content: `export const key = 'AKIAIOSFODNN7EXAMPLE';\n`,
          producedBy: 'base.leaky',
        },
      ],
    };

    await expect(runPipeline(spineSpec(), { registry: registry(leaky) })).rejects.toThrow(
      /secret-literal/,
    );
  });

  it('reports a codemod aimed at a file no recipe produced', async () => {
    const orphan: Recipe = {
      id: 'feature.orphan',
      phase: 'feature',
      appliesTo: () => true,
      codemods: () => [
        { file: 'does/not/exist.ts', kind: 'addImport', args: { module: 'm', named: ['x'] } },
      ],
    };

    await expect(
      runPipeline(spineSpec(), { registry: registry(baseRecipe, orphan) }),
    ).rejects.toThrow(/codemod-target-missing/);
  });

  it('surfaces every error at once rather than only the first', async () => {
    const messy: Recipe = {
      id: 'base.messy',
      phase: 'base',
      appliesTo: () => true,
      files: async () => [
        { path: 'package.json', content: '{}\n', producedBy: 'base.messy' },
        { path: 'a.ts', content: 'const a = <%= x %>;\n', producedBy: 'base.messy' },
        { path: 'b.ts', content: 'const b = <%= y %>;\n', producedBy: 'base.messy' },
      ],
    };

    try {
      await runPipeline(spineSpec(), { registry: registry(messy) });
      expect.unreachable();
    } catch (err) {
      expect(
        (err as GenerationFailedError).diagnostics.filter((d) => d.severity === 'error').length,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  // The whole point of keeping every stage in memory (doc 06 §1).
  it('leaves no side effects when generation fails', async () => {
    const broken: Recipe = {
      id: 'base.broken2',
      phase: 'base',
      appliesTo: () => true,
      files: async () => [{ path: 'a.ts', content: '<%= boom %>\n', producedBy: 'base.broken2' }],
    };

    await expect(runPipeline(spineSpec(), { registry: registry(broken) })).rejects.toThrow();
    // Nothing to assert about the filesystem: the pipeline has no filesystem access at all.
    // Emission is the caller's responsibility, which is what makes that guarantee structural.
  });
});

describe('pipeline — formatting', () => {
  it('formats generated TypeScript', async () => {
    const ugly: Recipe = {
      id: 'base.ugly',
      phase: 'base',
      appliesTo: () => true,
      files: async () => [
        { path: 'package.json', content: '{}\n', producedBy: 'base.ugly' },
        { path: 'a.ts', content: `export const x={a:1,b:2}\n`, producedBy: 'base.ugly' },
      ],
    };

    const result = await runPipeline(spineSpec(), { registry: registry(ugly) });
    const formatted = result.files.find((f) => f.path === 'a.ts')!.content as string;
    expect(formatted).toBe('export const x = { a: 1, b: 2 };\n');
  });

  it('fails when a template emits code that cannot be parsed', async () => {
    const invalid: Recipe = {
      id: 'base.invalid',
      phase: 'base',
      appliesTo: () => true,
      files: async () => [
        { path: 'package.json', content: '{}\n', producedBy: 'base.invalid' },
        { path: 'a.ts', content: `export const = ;;;\n`, producedBy: 'base.invalid' },
      ],
    };

    await expect(runPipeline(spineSpec(), { registry: registry(invalid) })).rejects.toThrow(
      /format-parse-failed/,
    );
  });
});
