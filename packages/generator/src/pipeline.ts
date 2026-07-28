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

  const ctx: RecipeContext = {
    spec,
    clock: options.clock ?? defaultClock(),
    ids: options.ids ?? defaultIds(),
  };

  // ── 2. plan ────────────────────────────────────────────────────────────────
  const recipes = await stage('plan', () => options.registry.plan(spec));
  emit({ type: 'log', level: 'info', message: `${recipes.length} recipes selected` });

  // ── 3. render ──────────────────────────────────────────────────────────────
  const tree = new FileTree();
  const packageJson = new PackageJsonBuilder();
  const env = new EnvBuilder();
  const readme = new ReadmeBuilder();
  const gitignore = new LineFileBuilder();
  const codemods: CodemodOp[] = [];
  const postInstall: string[] = [];

  await stage('render', async () => {
    let index = 0;
    for (const recipe of recipes) {
      emit({
        type: 'progress',
        current: ++index,
        total: recipes.length,
        label: recipe.id,
      });

      for (const file of (await recipe.files?.(ctx)) ?? []) {
        tree.add(file);
      }

      const delta = recipe.packageJson?.(ctx);
      if (delta) packageJson.add(recipe.id, delta);

      const vars = recipe.env?.(ctx);
      if (vars?.length) env.add(recipe.id, vars);

      const section = recipe.readme?.(ctx);
      if (section) readme.add(recipe.id, section);

      codemods.push(...(recipe.codemods?.(ctx) ?? []));
      postInstall.push(...(recipe.postInstall?.(ctx) ?? []));
    }
  });

  // ── 4. merge ───────────────────────────────────────────────────────────────
  await stage('merge', () => {
    // package.json: the base recipe owns the file; features only add to it.
    if (tree.has('package.json')) {
      const base = JSON.parse(tree.readText('package.json')) as Record<string, unknown>;
      const merged = packageJson.build(base, report);
      tree.replace('package.json', `${JSON.stringify(merged, null, 2)}\n`);
    }

    const envExample = env.buildEnvExample(report);
    if (envExample) {
      tree.set({ path: '.env.example', content: envExample, producedBy: '<merge>' });
    }

    const secrets = env.buildSecretsDoc(report);
    if (secrets) {
      tree.set({ path: 'SECRETS.md', content: secrets, producedBy: '<merge>' });
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
