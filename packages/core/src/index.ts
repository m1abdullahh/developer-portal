/**
 * @idp/core — the shared contract layer.
 *
 * This package depends on nothing internal (enforced by .dependency-cruiser.cjs). Everything
 * else in the monorepo depends on it, so keeping it a leaf is what stops the ProjectSpec
 * contract from becoming coupled to any one implementation.
 */

export * from './enums.js';
export * from './slug.js';
export * from './compatibility.js';
export * from './spec.js';
export * from './versions.js';

// Exported deliberately: the generator's golden suite, the smoke matrix and the CLI all need
// the same known-good specs. One definition stops the three from drifting apart.
export * from './fixtures.js';
