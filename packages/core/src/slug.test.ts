import { describe, expect, it } from 'vitest';
import { slugify, suggestSlugs, validateSlug } from './slug.js';

describe('validateSlug', () => {
  it('accepts the PRD example', () => {
    expect(validateSlug('acme-health-backend').valid).toBe(true);
  });

  it.each(['api-v2', 'a1b', 'my-service-2', 'x'.repeat(48)])('accepts %s', (slug) => {
    expect(validateSlug(slug).valid).toBe(true);
  });

  it('rejects names shorter than the minimum', () => {
    const r = validateSlug('ab');
    expect(r.valid).toBe(false);
    expect(r.problem).toBe('too-short');
  });

  it('rejects names over 48 chars and explains the K8s headroom reason', () => {
    const r = validateSlug('a'.repeat(49));
    expect(r.valid).toBe(false);
    expect(r.problem).toBe('too-long');
    expect(r.message).toMatch(/Kubernetes/);
  });

  it('rejects a leading digit', () => {
    expect(validateSlug('2fast').problem).toBe('leading-digit');
  });

  it('rejects a trailing hyphen', () => {
    expect(validateSlug('acme-').problem).toBe('trailing-hyphen');
  });

  it('rejects consecutive hyphens', () => {
    expect(validateSlug('acme--health').problem).toBe('consecutive-hyphens');
  });

  it.each(['Acme', 'acme_health', 'acme.health', 'acme health', 'acme/health'])(
    'rejects invalid format: %s',
    (slug) => {
      expect(validateSlug(slug).problem).toBe('invalid-format');
    },
  );

  // The sharp one: a repo named `con` cannot be cloned on Windows at all.
  it.each(['con', 'aux', 'nul', 'lpt1'])('rejects Windows device name: %s', (slug) => {
    expect(validateSlug(slug).problem).toBe('reserved');
  });

  it.each(['api', 'argocd', 'kube-system', 'git', 'portal'])(
    'rejects reserved infrastructure name: %s',
    (slug) => {
      expect(validateSlug(slug).problem).toBe('reserved');
    },
  );

  it('always gives an actionable message, never a bare "invalid"', () => {
    for (const bad of ['ab', 'Acme', 'con', '2fast', 'acme--x', 'acme-']) {
      const r = validateSlug(bad);
      expect(r.message).toBeDefined();
      expect(r.message!.length).toBeGreaterThan(10);
      expect(r.message).not.toMatch(/^invalid input$/i);
    }
  });
});

describe('slugify', () => {
  it.each([
    ['Acme Health Backend', 'acme-health-backend'],
    ['  Acme   Health  ', 'acme-health'],
    ['Acme_Health.Backend', 'acme-health-backend'],
    ['Café Ünïcode', 'cafe-unicode'],
    ['2024 Rebuild', 'rebuild'],
    ['ACME', 'acme'],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('produces a valid slug for arbitrary realistic input', () => {
    for (const input of ['Acme Health!! (v2)', 'Client — Project #3', 'Über Service 2026']) {
      const s = slugify(input);
      if (s.length >= 3) expect(validateSlug(s).valid).toBe(true);
    }
  });

  it('never exceeds the max length', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(48);
  });
});

describe('suggestSlugs', () => {
  it('suggests only valid alternatives', () => {
    for (const s of suggestSlugs('acme-health', 2026)) {
      expect(validateSlug(s).valid).toBe(true);
    }
  });

  it('is deterministic — the year is injected, never read from the clock', () => {
    expect(suggestSlugs('acme-health', 2026)).toEqual(suggestSlugs('acme-health', 2026));
    expect(suggestSlugs('acme-health', 2026)).toContain('acme-health-2026');
  });

  it('keeps suggestions within the length cap for a near-max slug', () => {
    for (const s of suggestSlugs('a'.repeat(48), 2026)) {
      expect(s.length).toBeLessThanOrEqual(48);
    }
  });
});
