/**
 * Generator contracts — see docs/plan/05-generator-engine.md
 *
 * Defined in P0 so the three workstreams can build against a stable shape before the engine
 * itself exists. Implementations land in P1.
 */

import type { ProjectSpec } from '@idp/core';
import type { RecipeLayer, RepoLayout } from './layout.js';

// ── Virtual file tree ────────────────────────────────────────────────────────

/**
 * A file that exists only in memory until the `emit` stage.
 *
 * The whole merge/codemod/verify design depends on nothing touching disk until generation has
 * fully succeeded — a failed generation must leave zero side effects (doc 06 §1).
 */
export interface VirtualFile {
  path: string;
  content: string | Uint8Array;
  /** Unix mode; set for shell scripts and git hooks that must be executable. */
  mode?: number;
  /** Recipe id that produced this file — surfaced in the MergeReport when files collide. */
  producedBy: string;
}

export type VirtualTree = ReadonlyMap<string, VirtualFile>;

// ── Recipes ──────────────────────────────────────────────────────────────────

/**
 * Phase ordering is what makes composition deterministic.
 *   base        — framework/runtime skeletons; exactly one per layer; owns the root files
 *   feature     — styling, state, ORM, middleware, page modules; may add, never overwrite base
 *   integration — cross-layer wiring that must see the full selection
 *   finalize    — README, .env.example, formatting; consumes earlier contributions
 */
export type RecipePhase = 'base' | 'feature' | 'integration' | 'finalize';

export interface PackageDelta {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

export interface EnvVar {
  key: string;
  example: string;
  required: boolean;
  description: string;
  /** true ⇒ must never be committed; surfaces in SECRETS.md rather than .env.example. */
  secret?: boolean;
}

export interface ReadmeSection {
  /** Sort key; lower renders earlier. Keeps README order stable across recipe sets. */
  order: number;
  heading: string;
  body: string;
}

export interface CodemodOp {
  file: string;
  kind: string;
  /** Op-specific payload; each codemod validates its own. */
  args: Record<string, unknown>;
}

export interface RecipeContext {
  spec: ProjectSpec;
  /** Injected, never read from the system clock — determinism (doc 05 §6). */
  clock: { now(): Date; year(): number };
  /** Injected id source so generated ids are stable under golden-file testing. */
  ids: { next(prefix: string): string };
  /** Where each layer lives in the repo — see layout.ts. */
  paths: RepoLayout;
}

export interface Recipe {
  id: string;
  phase: RecipePhase;
  /**
   * Which part of the project this recipe contributes to. Determines the path prefix its
   * files, package.json and env vars receive when the project has both a UI and an API.
   * Defaults to 'root'.
   */
  layer?: RecipeLayer;
  appliesTo(spec: ProjectSpec): boolean;
  /**
   * Recipe ids that must run before this one.
   *
   * A function when the answer depends on the spec: a state recipe requires *the* UI framework
   * recipe, and which one that is only becomes known once a framework is chosen. Listing every
   * framework id statically would fail validation, since exactly one of them applies.
   */
  requires?: readonly string[] | ((spec: ProjectSpec) => readonly string[]);
  /** Recipe ids that must not coexist with this one. */
  conflicts?: readonly string[];

  files?(ctx: RecipeContext): Promise<VirtualFile[]>;
  packageJson?(ctx: RecipeContext): PackageDelta;
  env?(ctx: RecipeContext): EnvVar[];
  codemods?(ctx: RecipeContext): CodemodOp[];
  readme?(ctx: RecipeContext): ReadmeSection;
  /** Lines contributed to .gitignore. Order-sensitive and additive, so no recipe owns the file. */
  gitignore?(ctx: RecipeContext): string[];
  postInstall?(ctx: RecipeContext): string[];
}

// ── Diagnostics & reporting ──────────────────────────────────────────────────

export type DiagnosticSeverity = 'info' | 'warn' | 'error';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  file?: string;
  recipeId?: string;
}

/**
 * Records every merge decision. Silent merges are how generators become un-debuggable —
 * this is surfaced in the portal's job detail view (doc 05 §3).
 */
export interface MergeReport {
  dependencyResolutions: Array<{
    name: string;
    chosen: string;
    candidates: Array<{ version: string; recipeId: string }>;
  }>;
  fileCollisions: Array<{ path: string; recipeIds: string[]; strategy: string }>;
  diagnostics: Diagnostic[];
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export const STAGE_NAMES = [
  'resolve',
  'plan',
  'render',
  'merge',
  'codemod',
  'format',
  'verify',
  'emit',
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

export type StageEvent =
  | { type: 'stage'; stage: StageName; status: 'start' | 'done' | 'fail'; ms?: number }
  | { type: 'log'; level: DiagnosticSeverity; message: string }
  | { type: 'progress'; current: number; total: number; label: string };

export interface GenerateOptions {
  onProgress?: (event: StageEvent) => void;
  /** Skip the emit stage — used by the portal's preview mode. */
  dryRun?: boolean;
}

export interface GenerateResult {
  files: VirtualFile[];
  diagnostics: Diagnostic[];
  mergeReport: MergeReport;
  durationMs: number;
  postInstall: string[];
}
