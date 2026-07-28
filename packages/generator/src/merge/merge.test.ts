import { describe, expect, it } from 'vitest';
import { MergeReportBuilder } from './report.js';
import { PackageJsonBuilder, ScriptConflictError } from './package-json.js';
import { EnvBuilder } from './env.js';
import { LineFileBuilder } from './text.js';
import { deepMerge, sortDeep } from './deep.js';
import { ReadmeBuilder, README_ORDER } from './readme.js';
import type { EnvVar } from '../types.js';

const report = () => new MergeReportBuilder();

describe('package.json — dependency resolution', () => {
  it('merges contributions from several recipes', () => {
    const b = new PackageJsonBuilder();
    b.add('ui.next', { dependencies: { next: '16.2.12', react: '19.2.8' } });
    b.add('ui.state.zustand', { dependencies: { zustand: '5.0.14' } });

    const out = b.build({ name: 'x' }, report());
    expect(out['dependencies']).toEqual({ next: '16.2.12', react: '19.2.8', zustand: '5.0.14' });
  });

  it('resolves a version conflict to the highest and records the decision', () => {
    const r = report();
    const b = new PackageJsonBuilder();
    b.add('recipe.a', { dependencies: { zod: '4.4.3' } });
    b.add('recipe.b', { dependencies: { zod: '4.5.0' } });

    const out = b.build({}, r) as { dependencies: Record<string, string> };
    expect(out.dependencies['zod']).toBe('4.5.0');

    const resolution = r.build().dependencyResolutions.find((d) => d.name === 'zod');
    expect(resolution?.chosen).toBe('4.5.0');
    expect(resolution?.candidates).toHaveLength(2);
  });

  it('does not record a resolution when every recipe agrees', () => {
    const r = report();
    const b = new PackageJsonBuilder();
    b.add('a', { dependencies: { zod: '4.4.3' } });
    b.add('b', { dependencies: { zod: '4.4.3' } });

    b.build({}, r);
    expect(r.build().dependencyResolutions).toHaveLength(0);
  });

  it('compares ranges by their minimum satisfying version', () => {
    const b = new PackageJsonBuilder();
    b.add('a', { dependencies: { pkg: '^1.2.0' } });
    b.add('b', { dependencies: { pkg: '^1.5.0' } });

    const out = b.build({}, report()) as { dependencies: Record<string, string> };
    expect(out.dependencies['pkg']).toBe('^1.5.0');
  });

  it('warns rather than guessing when a specifier is not semver', () => {
    const r = report();
    const b = new PackageJsonBuilder();
    b.add('a', { dependencies: { pkg: '1.0.0' } });
    b.add('b', { dependencies: { pkg: 'github:acme/pkg#main' } });

    b.build({}, r);
    const warned = r.build().diagnostics.find((d) => d.code === 'dependency-unresolvable');
    expect(warned).toBeDefined();
    expect(warned?.message).toMatch(/not all/i);
  });

  it('keeps dependencies and devDependencies separate', () => {
    const b = new PackageJsonBuilder();
    b.add('a', { dependencies: { react: '19.2.8' }, devDependencies: { vitest: '4.1.10' } });

    const out = b.build({}, report());
    expect(out['dependencies']).toEqual({ react: '19.2.8' });
    expect(out['devDependencies']).toEqual({ vitest: '4.1.10' });
  });

  it('sorts keys so output is byte-identical regardless of contribution order', () => {
    const forward = new PackageJsonBuilder();
    forward.add('a', { dependencies: { zod: '4.4.3' } });
    forward.add('b', { dependencies: { axios: '1.0.0' } });

    const reverse = new PackageJsonBuilder();
    reverse.add('b', { dependencies: { axios: '1.0.0' } });
    reverse.add('a', { dependencies: { zod: '4.4.3' } });

    expect(JSON.stringify(forward.build({}, report()))).toBe(
      JSON.stringify(reverse.build({}, report())),
    );
  });
});

describe('package.json — script conflicts are fatal', () => {
  // Unlike versions, there is no defensible way to pick between two "build" commands.
  it('throws naming both recipes and both commands', () => {
    const b = new PackageJsonBuilder();
    b.add('recipe.a', { scripts: { build: 'next build' } });
    b.add('recipe.b', { scripts: { build: 'vite build' } });

    try {
      b.build({}, report());
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScriptConflictError);
      const msg = (err as Error).message;
      expect(msg).toContain('recipe.a');
      expect(msg).toContain('recipe.b');
      expect(msg).toContain('next build');
      expect(msg).toContain('vite build');
    }
  });

  it('allows two recipes to declare an identical script', () => {
    const b = new PackageJsonBuilder();
    b.add('a', { scripts: { lint: 'eslint .' } });
    b.add('b', { scripts: { lint: 'eslint .' } });
    expect(() => b.build({}, report())).not.toThrow();
  });

  it('conflicts with a base script too', () => {
    const b = new PackageJsonBuilder();
    b.add('a', { scripts: { build: 'tsc' } });
    expect(() => b.build({ scripts: { build: 'next build' } }, report())).toThrow(
      ScriptConflictError,
    );
  });

  it('reports the pair identically regardless of contribution order', () => {
    const message = (order: string[]) => {
      const b = new PackageJsonBuilder();
      b.add(order[0]!, { scripts: { build: order[0] === 'aaa' ? 'x' : 'y' } });
      b.add(order[1]!, { scripts: { build: order[1] === 'aaa' ? 'x' : 'y' } });
      try {
        b.build({}, report());
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(message(['aaa', 'zzz'])).toBe(message(['zzz', 'aaa']));
  });
});

describe('.env.example', () => {
  const v = (key: string, extra: Partial<EnvVar> = {}): EnvVar => ({
    key,
    example: 'value',
    required: true,
    description: `desc for ${key}`,
    ...extra,
  });

  it('groups keys under the contributing recipe', () => {
    const b = new EnvBuilder();
    b.add('api.db.prisma', [v('DATABASE_URL')]);
    b.add('api.auth.jwt', [v('JWT_SECRET', { secret: true })]);

    const out = b.buildEnvExample(report());
    expect(out).toContain('api.db.prisma');
    expect(out).toContain('api.auth.jwt');
    expect(out.indexOf('api.db.prisma')).toBeLessThan(out.indexOf('api.auth.jwt'));
  });

  // A plausible-looking placeholder is how fake credentials get committed and then trusted.
  it('never writes a value for a secret', () => {
    const b = new EnvBuilder();
    b.add('r', [v('STRIPE_SECRET_KEY', { secret: true, example: 'sk_live_abc123' })]);

    const out = b.buildEnvExample(report());
    expect(out).toContain('STRIPE_SECRET_KEY=');
    expect(out).not.toContain('sk_live_abc123');
  });

  it('writes examples for non-secrets', () => {
    const b = new EnvBuilder();
    b.add('r', [v('PORT', { example: '3000' })]);
    expect(b.buildEnvExample(report())).toContain('PORT=3000');
  });

  it('keeps the first declaration and warns when two recipes disagree', () => {
    const r = report();
    const b = new EnvBuilder();
    b.add('first', [v('PORT', { example: '3000' })]);
    b.add('second', [v('PORT', { example: '8080' })]);

    const out = b.buildEnvExample(r);
    expect(out).toContain('PORT=3000');
    expect(out).not.toContain('8080');
    expect(r.build().diagnostics.some((d) => d.code === 'env-key-conflict')).toBe(true);
  });

  it('deduplicates a key declared identically twice, without warning', () => {
    const r = report();
    const b = new EnvBuilder();
    b.add('a', [v('PORT', { example: '3000' })]);
    b.add('b', [v('PORT', { example: '3000' })]);

    expect(b.buildEnvExample(r).match(/^PORT=/gm)).toHaveLength(1);
    expect(r.build().diagnostics).toHaveLength(0);
  });

  it('builds SECRETS.md listing only secrets', () => {
    const b = new EnvBuilder();
    b.add('r', [v('PORT'), v('JWT_SECRET', { secret: true })]);

    const doc = b.buildSecretsDoc(report())!;
    expect(doc).toContain('JWT_SECRET');
    expect(doc).not.toContain('| `PORT`');
  });

  it('omits SECRETS.md entirely when nothing is secret', () => {
    const b = new EnvBuilder();
    b.add('r', [v('PORT')]);
    expect(b.buildSecretsDoc(report())).toBeNull();
  });
});

describe('line files (.gitignore)', () => {
  // Sorting would move `!dist/keep.txt` before `dist/`, silently reversing the intent.
  it('preserves order so negation rules keep working', () => {
    const b = new LineFileBuilder();
    b.add('base', ['dist/', '!dist/keep.txt']);

    const out = b.build();
    expect(out.indexOf('dist/')).toBeLessThan(out.indexOf('!dist/keep.txt'));
  });

  it('does not alphabetise', () => {
    const b = new LineFileBuilder();
    b.add('r', ['zebra/', 'alpha/']);
    const out = b.build();
    expect(out.indexOf('zebra/')).toBeLessThan(out.indexOf('alpha/'));
  });

  it('deduplicates identical rules across recipes', () => {
    const b = new LineFileBuilder();
    b.add('a', ['node_modules/', 'dist/']);
    b.add('b', ['node_modules/', 'coverage/']);

    const out = b.build();
    expect(out.match(/^node_modules\/$/gm)).toHaveLength(1);
    expect(out).toContain('coverage/');
  });

  it('drops a group that contributed only duplicates', () => {
    const b = new LineFileBuilder();
    b.add('a', ['node_modules/']);
    b.add('b', ['node_modules/']);
    expect(b.build()).not.toContain('# b');
  });

  it('returns empty string when nothing was contributed', () => {
    expect(new LineFileBuilder().build()).toBe('');
  });
});

describe('deep merge', () => {
  it('merges nested objects', () => {
    const out = deepMerge(
      { compilerOptions: { strict: true, target: 'ES2023' } },
      { compilerOptions: { jsx: 'preserve' } },
    );
    expect(out).toEqual({ compilerOptions: { strict: true, target: 'ES2023', jsx: 'preserve' } });
  });

  it('unions arrays and removes duplicates by default', () => {
    const out = deepMerge({ include: ['src'] }, { include: ['tests', 'src'] });
    expect(out['include']).toEqual(['src', 'tests']);
  });

  it('concatenates arrays at opted-in paths, preserving order', () => {
    const out = deepMerge(
      { extends: ['a'] },
      { extends: ['b', 'a'] },
      { concatArrays: ['extends'] },
    );
    expect(out['extends']).toEqual(['a', 'b', 'a']);
  });

  it('dedupes object array elements by content, not identity', () => {
    const out = deepMerge({ p: [{ x: 1 }] }, { p: [{ x: 1 }, { x: 2 }] });
    expect(out['p']).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('reports a scalar conflict and takes the incoming value', () => {
    const conflicts: string[] = [];
    const out = deepMerge(
      { compilerOptions: { target: 'ES2020' } },
      { compilerOptions: { target: 'ES2023' } },
      { onScalarConflict: (p) => conflicts.push(p) },
    );
    expect(conflicts).toEqual(['compilerOptions.target']);
    expect((out['compilerOptions'] as Record<string, unknown>)['target']).toBe('ES2023');
  });

  it('does not report a conflict when values are equal', () => {
    const conflicts: string[] = [];
    deepMerge({ a: 1 }, { a: 1 }, { onScalarConflict: (p) => conflicts.push(p) });
    expect(conflicts).toEqual([]);
  });

  it('mutates neither input', () => {
    const base = { a: { b: 1 } };
    const incoming = { a: { c: 2 } };
    deepMerge(base, incoming);
    expect(base).toEqual({ a: { b: 1 } });
    expect(incoming).toEqual({ a: { c: 2 } });
  });

  it('sortDeep produces byte-stable serialisation', () => {
    const a = sortDeep({ z: 1, a: { y: 2, b: 3 } });
    const b = sortDeep({ a: { b: 3, y: 2 }, z: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('README assembly', () => {
  it('orders sections by declared order, not contribution order', () => {
    const b = new ReadmeBuilder();
    b.add('ops', { order: README_ORDER.deployment, heading: 'Deployment', body: 'deploy' });
    b.add('base', { order: README_ORDER.gettingStarted, heading: 'Getting Started', body: 'run' });

    const out = b.build('My Project');
    expect(out.indexOf('Getting Started')).toBeLessThan(out.indexOf('Deployment'));
  });

  it('is deterministic when orders tie', () => {
    const build = (ids: string[]) => {
      const b = new ReadmeBuilder();
      for (const id of ids) b.add(id, { order: 500, heading: `H-${id}`, body: id });
      return b.build('P');
    };
    expect(build(['a', 'b'])).toBe(build(['b', 'a']));
  });

  it('includes the title and optional subtitle', () => {
    const out = new ReadmeBuilder().build('Acme Health', 'Patient records service.');
    expect(out).toMatch(/^# Acme Health/);
    expect(out).toContain('Patient records service.');
  });

  it('never leaves more than one blank line between blocks', () => {
    const b = new ReadmeBuilder();
    b.add('r', { order: 100, heading: 'A', body: 'text\n\n\n\nmore' });
    expect(b.build('P')).not.toMatch(/\n{3,}/);
  });
});
