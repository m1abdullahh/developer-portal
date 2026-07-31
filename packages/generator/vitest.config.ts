import { defineConfig } from 'vitest/config';

/**
 * Vitest's 5-second default is wrong for this package.
 *
 * Almost every suite here runs `runPipeline` — resolving recipes, rendering every template,
 * applying ts-morph codemods and formatting the result. That is seconds of real work per spec by
 * design, and several suites do it for a matrix of them. On an idle machine they finish inside the
 * default; under `turbo run test typecheck lint`, with six other packages compiling alongside,
 * ten tests across six files were timing out at once.
 *
 * That looked like a flaky test suite and was actually a mis-set budget: nothing was hanging, the
 * work simply took longer than five seconds while sharing the CPU. Raising it here rather than
 * per-file keeps the next pipeline-backed suite from rediscovering the same thing — a real hang is
 * still caught by the workflow's own 15-minute job timeout.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
