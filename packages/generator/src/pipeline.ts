/**
 * The generation pipeline.
 *
 * resolve → plan → render → merge → codemod → format → verify
 *
 * Every stage is a pure function over the in-memory tree, and NONE of them touches the
 * filesystem. Emission is the caller's job (the worker hands the tree to a VcsDriver), which is
 * what guarantees a failed generation leaves zero side effects — retrying costs only CPU
 * (doc 06 §1).
 *
 * See docs/plan/00-architecture.md §4 for the stage table.
 */

import { parseProjectSpec, type ProjectSpec } from '@idp/core';
import { FileTree } from './tree.js';
import { type RecipeRegistry } from './registry.js';
import { applyPrefix, computeLayout, prefixFor } from './layout.js';
import {
  EnvBuilder,
  MergeReportBuilder,
  PackageJsonBuilder,
  ReadmeBuilder,
} from './merge/index.js';
import { LineFileBuilder } from './merge/text.js';
import { applyCodemods } from './stages/codemod-stage.js';
import { formatTree } from './stages/format.js';
import { verifyTree } from './stages/verify.js';
import type {
  CodemodOp,
  Diagnostic,
  GenerateResult,
  RecipeContext,
  StageEvent,
  StageName,
} from './types.js';

export interface PipelineOptions {
  registry: RecipeRegistry;
  onProgress?: (event: StageEvent) => void;
  /** Injected so generated timestamps are stable under golden-file testing (doc 05 §6). */
  clock?: { now(): Date; year(): number };
  /** Injected id source, for the same reason. */
  ids?: { next(prefix: string): string };
}

export class GenerationFailedError extends Error {
  constructor(
    readonly stage: StageName,
    readonly diagnostics: readonly Diagnostic[],
  ) {
    const errors = diagnostics.filter((d) => d.severity === 'error');
    super(
      `Generation failed at the "${stage}" stage with ${errors.length} error(s):\n` +
        errors.map((d) => `  ${d.file ? `${d.file}: ` : ''}${d.code} — ${d.message}`).join('\n'),
    );
    this.name = 'GenerationFailedError';
  }
}

/** Deterministic defaults — a fixed epoch rather than the wall clock. */
const FIXED_EPOCH = new Date('2026-01-01T00:00:00.000Z');

function defaultClock() {
  return { now: () => FIXED_EPOCH, year: () => FIXED_EPOCH.getUTCFullYear() };
}

function defaultIds() {
  let counter = 0;
  return { next: (prefix: string) => `${prefix}-${(++counter).toString(36).padStart(4, '0')}` };
}

export async function runPipeline(
  input: unknown,
  options: PipelineOptions,
): Promise<GenerateResult> {
  const started = Date.now();
  const emit = options.onProgress ?? (() => {});
  const report = new MergeReportBuilder();
  const diagnostics: Diagnostic[] = [];

  const stage = async <T>(name: StageName, fn: () => T | Promise<T>): Promise<T> => {
    emit({ type: 'stage', stage: name, status: 'start' });
    const at = Date.now();
    try {
      const result = await fn();
      emit({ type: 'stage', stage: name, status: 'done', ms: Date.now() - at });
      return result;
    } catch (err) {
      emit({ type: 'stage', stage: name, status: 'fail', ms: Date.now() - at });
      throw err;
    }
  };

  // ── 1. resolve ─────────────────────────────────────────────────────────────
  const spec: ProjectSpec = await stage('resolve', () => parseProjectSpec(input));

  const layout = computeLayout(spec);

  const ctx: RecipeContext = {
    spec,
    paths: layout,
    clock: options.clock ?? defaultClock(),
    ids: options.ids ?? defaultIds(),
  };

  // ── 2. plan ────────────────────────────────────────────────────────────────
  const recipes = await stage('plan', () => options.registry.plan(spec));
  emit({ type: 'log', level: 'info', message: `${recipes.length} recipes selected` });

  // ── 3. render ──────────────────────────────────────────────────────────────
  const tree = new FileTree();
  const readme = new ReadmeBuilder();
  const gitignore = new LineFileBuilder();
  const codemods: CodemodOp[] = [];
  const postInstall: string[] = [];

  // package.json and .env.example are per-layer: a UI+API project has two of each, since they
  // are two separate deployables with different dependencies and different configuration.
  const packageJsonByPath = new Map<string, PackageJsonBuilder>();
  const envByPath = new Map<string, EnvBuilder>();

  const builderFor = <T>(map: Map<string, T>, key: string, make: () => T): T => {
    const existing = map.get(key);
    if (existing) return existing;
    const created = make();
    map.set(key, created);
    return created;
  };

  await stage('render', async () => {
    let index = 0;
    for (const recipe of recipes) {
      emit({ type: 'progress', current: ++index, total: recipes.length, label: recipe.id });

      const prefix = prefixFor(layout, recipe.layer);

      // Templates declare paths relative to their own layer, so they never need to know
      // whether this project happens to be a monorepo.
      for (const file of (await recipe.files?.(ctx)) ?? []) {
        tree.add({ ...file, path: applyPrefix(prefix, file.path) });
      }

      const delta = recipe.packageJson?.(ctx);
      if (delta) {
        builderFor(packageJsonByPath, `${prefix}package.json`, () => new PackageJsonBuilder()).add(
          recipe.id,
          delta,
        );
      }

      const vars = recipe.env?.(ctx);
      if (vars?.length) {
        builderFor(envByPath, `${prefix}.env.example`, () => new EnvBuilder()).add(recipe.id, vars);
      }

      const ignore = recipe.gitignore?.(ctx);
      if (ignore?.length) gitignore.add(recipe.id, ignore);

      const section = recipe.readme?.(ctx);
      if (section) readme.add(recipe.id, section);

      // Codemod targets are layer-relative too, for the same reason.
      for (const op of recipe.codemods?.(ctx) ?? []) {
        codemods.push({ ...op, file: applyPrefix(prefix, op.file) });
      }

      postInstall.push(...(recipe.postInstall?.(ctx) ?? []));
    }
  });

  // ── 4. merge ───────────────────────────────────────────────────────────────
  await stage('merge', () => {
    for (const [path, builder] of [...packageJsonByPath].sort(([a], [b]) => a.localeCompare(b))) {
      // The layer's base recipe owns the file; features only add to it.
      if (!tree.has(path)) continue;
      const base = JSON.parse(tree.readText(path)) as Record<string, unknown>;
      tree.replace(path, `${JSON.stringify(builder.build(base, report), null, 2)}\n`);
    }

    for (const [path, builder] of [...envByPath].sort(([a], [b]) => a.localeCompare(b))) {
      const envExample = builder.buildEnvExample(report);
      if (envExample) tree.set({ path, content: envExample, producedBy: '<merge>' });
    }

    // One SECRETS.md at the root: a developer needs a single answer to "what must I set?",
    // not one file per layer.
    const allSecrets = [...envByPath.values()]
      .map((b) => b.buildSecretsDoc(report))
      .filter((doc): doc is string => doc !== null);
    if (allSecrets.length > 0) {
      tree.set({
        path: 'SECRETS.md',
        content: mergeSecretsDocs(allSecrets),
        producedBy: '<merge>',
      });
    }

    // Baseline ignore rules every project needs, before recipe contributions.
    gitignore.add('<base>', ['node_modules/', 'dist/', '.env', '*.log', '.DS_Store']);
    tree.set({ path: '.gitignore', content: gitignore.build(), producedBy: '<merge>' });

    tree.set({
      path: 'README.md',
      content: readme.build(spec.meta.projectName, spec.meta.description),
      producedBy: '<merge>',
    });
  });

  // ── 5. codemod ─────────────────────────────────────────────────────────────
  const codemodResult = await stage('codemod', () => applyCodemods(tree, codemods));
  diagnostics.push(...codemodResult.diagnostics);

  // ── 6. format ──────────────────────────────────────────────────────────────
  const formatResult = await stage('format', () => formatTree(tree));
  diagnostics.push(...formatResult.diagnostics);

  // ── 7. verify ──────────────────────────────────────────────────────────────
  const verifyResult = await stage('verify', () => verifyTree(tree));
  diagnostics.push(...verifyResult.diagnostics, ...report.diagnostics);

  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new GenerationFailedError('verify', diagnostics);
  }

  return {
    files: tree.toArray(),
    diagnostics,
    mergeReport: report.build(),
    durationMs: Date.now() - started,
    postInstall: [...new Set(postInstall)],
  };
}

/**
 * Combines per-layer SECRETS.md documents into one root document.
 *
 * A UI+API project builds two EnvBuilders, so it produces two secret tables. Emitting both as
 * separate files would leave a developer hunting for which one lists the variable they are
 * missing; one table answers "what must I set?" in a single place.
 */
function mergeSecretsDocs(docs: readonly string[]): string {
  if (docs.length === 1) return docs[0]!;

  const lines = docs[0]!.split('\n');
  const footerAt = lines.findIndex((line) => line.startsWith('>'));
  const head = (footerAt === -1 ? lines : lines.slice(0, footerAt)).filter(
    (line, i, all) => line.trim() !== '' || (i > 0 && all[i - 1]!.trim() !== ''),
  );
  const footer = footerAt === -1 ? [] : lines.slice(footerAt);

  // Table rows begin with a backticked variable name; everything else is boilerplate we
  // already have from the first document.
  const extraRows = docs
    .slice(1)
    .flatMap((doc) => doc.split('\n').filter((line) => /^\|\s*`/.test(line)));

  return [...head, ...extraRows, '', ...footer].join('\n');
}
