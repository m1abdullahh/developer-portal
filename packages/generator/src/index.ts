/**
 * @idp/generator — the engine that turns a ProjectSpec into a file tree.
 *
 * Entry point is `runPipeline`, which composes the seven in-memory stages
 * (resolve → plan → render → merge → codemod → format → verify).
 *
 * Emission is deliberately NOT part of this package. Keeping the pipeline filesystem-free is
 * what guarantees a failed generation leaves zero side effects — the caller hands the finished
 * tree to a VcsDriver (doc 06 §1).
 *
 * See docs/plan/05-generator-engine.md.
 */

export * from './types.js';
export * from './tree.js';
export * from './frontmatter.js';
export * from './helpers.js';
export * from './renderer.js';
export * from './registry.js';
export * from './merge/index.js';
export * from './codemod/index.js';
export * from './stages/format.js';
export * from './stages/verify.js';
export * from './stages/codemod-stage.js';
export * from './pipeline.js';
export * from './emit.js';
export * from './recipes/index.js';
export * from './template-loader.js';
export * from './layout.js';
// The contracts recipes declare about themselves. Exported because the ops-lint harness compares
// what a chart renders against what the image promises, and needs the promise to compare with.
export * from './framework-contract.js';
export * from './styling-contract.js';
export * from './deployable-contract.js';
export * from './runtime-contract.js';
