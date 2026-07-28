/**
 * The idempotency key.
 *
 * `specHash` is what stops a double-clicked wizard from racing two provisions into one
 * repository name. It only works if it is stable across serialisations that differ only in key
 * order — which `JSON.stringify` alone does not guarantee, since it preserves insertion order.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec, uiOnlyVercelSpec } from '@idp/core';
import { nextJobId, selectVcsDriver, specHash, stableStringify } from './provisioning';

describe('stableStringify', () => {
  it('is insensitive to key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('sorts nested keys too', () => {
    expect(stableStringify({ outer: { z: 1, a: 2 } })).toBe(
      stableStringify({ outer: { a: 2, z: 1 } }),
    );
  });

  // Arrays are ordered data; reordering them changes meaning (teamSlugs, requiredStatusChecks).
  it('preserves array order', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('handles null, nested arrays and primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify({ a: null, b: [1, { d: 2, c: 3 }] })).toBe(
      '{"a":null,"b":[1,{"c":3,"d":2}]}',
    );
  });

  // `undefined` in an object is absent once serialised; treating it as a value would make
  // `{a: undefined}` and `{}` hash differently despite being the same spec.
  it('ignores undefined values', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe('specHash', () => {
  it('is stable for the same spec', () => {
    expect(specHash(spineSpec())).toBe(specHash(spineSpec()));
  });

  it('differs when any option changes', () => {
    const base = specHash(spineSpec());
    // The spine has cache on and two replicas, so both overrides are real changes.
    expect(specHash(spineSpec({ api: { cache: false } }))).not.toBe(base);
    expect(specHash(spineSpec({ ops: { k8s: { replicas: 5 } } }))).not.toBe(base);
  });

  it('differs across different projects', () => {
    expect(specHash(spineSpec())).not.toBe(specHash(uiOnlyVercelSpec()));
  });

  // Two projects can share a slug across organisations; the key must not collide.
  it('differs when only the organisation changes', () => {
    expect(specHash(spineSpec({ meta: { repo: { org: 'other-org' } } }))).not.toBe(
      specHash(spineSpec()),
    );
  });

  it('is short enough to index and long enough not to collide', () => {
    expect(specHash(spineSpec())).toHaveLength(32);
    expect(specHash(spineSpec())).toMatch(/^[0-9a-f]+$/);
  });
});

describe('nextJobId', () => {
  /**
   * Regression. The queue's default id factory is a per-process counter, so a restarted portal
   * reissued `job_1` and collided with the previous run's database row. The job then ran, the
   * insert failed silently, and the completion handler re-registered the *previous* service —
   * a wrong catalog entry with no error anywhere.
   */
  it('does not restart from a fixed value the way a counter would', () => {
    const ids = new Set(Array.from({ length: 500 }, () => nextJobId()));
    expect(ids.size).toBe(500);
    expect([...ids]).not.toContain('job_1');
  });

  it('is prefixed so an id is recognisable in a log line', () => {
    expect(nextJobId()).toMatch(/^job_[0-9a-f-]{36}$/);
  });
});

describe('selectVcsDriver', () => {
  // The default must never be GitHub. A misconfigured deployment should write a directory nobody
  // reads, not create repositories with whatever credentials it inherited.
  it('defaults to the filesystem driver', () => {
    expect(selectVcsDriver({}).kind).toBe('filesystem');
  });

  it('uses GitHub only when explicitly asked, and only with a token', () => {
    expect(selectVcsDriver({ VCS_DRIVER: 'github', GITHUB_TOKEN: 'x' }).kind).toBe('github');
    expect(() => selectVcsDriver({ VCS_DRIVER: 'github' })).toThrow(/GITHUB_TOKEN/);
  });
});
