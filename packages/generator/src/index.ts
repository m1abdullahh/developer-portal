/**
 * @idp/generator — the engine that turns a ProjectSpec into a file tree.
 *
 * P0 defines the contracts; the pipeline itself lands in P1.
 * See docs/plan/05-generator-engine.md.
 */

export * from './types.js';

import type { ProjectSpec } from '@idp/core';
import type { GenerateOptions, GenerateResult } from './types.js';

/**
 * Runs the ten-stage pipeline (doc 00 §4).
 *
 * Not yet implemented — P1.1. The signature is fixed now so the portal, worker and CLI can be
 * built against it in parallel.
 */
export function generate(
  _spec: ProjectSpec,
  _options: GenerateOptions = {},
): Promise<GenerateResult> {
  return Promise.reject(
    new Error(
      'generate() is not implemented yet — scheduled for P1.1 (docs/plan/09-execution-roadmap.md).',
    ),
  );
}
