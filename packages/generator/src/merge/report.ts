/**
 * Merge decision recording.
 *
 * Every non-trivial merge decision is recorded and surfaced in the portal's job detail view.
 * Silent merges are precisely how generators become impossible to debug: the output looks
 * plausible, two recipes disagreed somewhere, and nothing anywhere says which one won.
 */

import type { Diagnostic, MergeReport } from '../types.js';

export class MergeReportBuilder {
  readonly #dependencyResolutions: MergeReport['dependencyResolutions'] = [];
  readonly #fileCollisions: MergeReport['fileCollisions'] = [];
  readonly #diagnostics: Diagnostic[] = [];

  /** Records that several recipes wanted different versions of one dependency. */
  recordDependencyResolution(
    name: string,
    chosen: string,
    candidates: Array<{ version: string; recipeId: string }>,
  ): void {
    this.#dependencyResolutions.push({ name, chosen, candidates });
  }

  /** Records that a mergeable path was claimed by more than one recipe. */
  recordFileCollision(path: string, recipeIds: string[], strategy: string): void {
    this.#fileCollisions.push({ path, recipeIds: [...recipeIds].sort(), strategy });
  }

  diagnostic(d: Diagnostic): void {
    this.#diagnostics.push(d);
  }

  warn(code: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.#diagnostics.push({ severity: 'warn', code, message, ...extra });
  }

  info(code: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.#diagnostics.push({ severity: 'info', code, message, ...extra });
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics;
  }

  hasErrors(): boolean {
    return this.#diagnostics.some((d) => d.severity === 'error');
  }

  /** Sorted so two runs of the same spec produce an identical report (doc 05 §6). */
  build(): MergeReport {
    return {
      dependencyResolutions: [...this.#dependencyResolutions].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      fileCollisions: [...this.#fileCollisions].sort((a, b) => a.path.localeCompare(b.path)),
      diagnostics: [...this.#diagnostics].sort(
        (a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
      ),
    };
  }
}
