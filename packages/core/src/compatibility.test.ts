/**
 * Tests for the four PRD contradictions resolved in docs/plan/00-architecture.md §5.
 * If any of these regress, the wizard starts offering combinations that cannot be generated.
 */

import { describe, expect, it } from 'vitest';
import {
  availableOrms,
  availableParadigms,
  defaultOrm,
  moduleGate,
  ormUnavailableReason,
  paradigmUnavailableReason,
  resolveState,
  resolveStyling,
  step4Sections,
} from './compatibility.js';
import { API_RUNTIMES, UI_MODULES, UI_STATES, UI_STYLINGS } from './enums.js';

describe('contradiction 1+2 — Nuxt is Vue, but the PRD options are React', () => {
  it.each(UI_STATES)('maps state option %s to a Vue equivalent for Nuxt', (state) => {
    const resolved = resolveState('nuxt', state);
    // No React package may leak into a Vue project.
    for (const pkg of resolved.packages) {
      expect(pkg).not.toMatch(/react|redux|zustand/i);
    }
    expect(resolved.note).toBeDefined();
  });

  it.each(UI_STYLINGS)('maps styling option %s to a Vue equivalent for Nuxt', (styling) => {
    const resolved = resolveStyling('nuxt', styling);
    for (const pkg of resolved.packages) {
      expect(pkg).not.toMatch(/@mui|@emotion/i);
    }
  });

  it('maps Zustand to Pinia and React Query to vue-query', () => {
    expect(resolveState('nuxt', 'zustand').packages).toEqual(['pinia']);
    expect(resolveState('nuxt', 'react-query').packages).toEqual(['@tanstack/vue-query']);
  });

  it('maps MUI to Vuetify — MUI is React-only', () => {
    expect(resolveStyling('nuxt', 'mui').packages).toEqual(['vuetify']);
  });

  it('leaves React frameworks untouched', () => {
    expect(resolveState('nextjs-app', 'zustand').packages).toEqual(['zustand']);
    expect(resolveStyling('vite-react', 'mui').packages).toContain('@mui/material');
  });

  it('gives Context API and CSS Modules zero extra dependencies in both ecosystems', () => {
    expect(resolveState('nextjs-app', 'context').packages).toEqual([]);
    expect(resolveState('nuxt', 'context').packages).toEqual([]);
    expect(resolveStyling('nextjs-app', 'css-modules').packages).toEqual([]);
  });
});

describe('contradiction 3 — tRPC is Node-only', () => {
  it('offers tRPC only for node-ts', () => {
    expect(availableParadigms('node-ts')).toContain('trpc');
    expect(availableParadigms('python-fastapi')).not.toContain('trpc');
    expect(availableParadigms('go-gin')).not.toContain('trpc');
  });

  it('explains why rather than silently hiding the option', () => {
    const reason = paradigmUnavailableReason('python-fastapi', 'trpc');
    expect(reason).toMatch(/Node\.js/);
    expect(paradigmUnavailableReason('node-ts', 'trpc')).toBeNull();
  });

  it.each(API_RUNTIMES)('always offers REST for %s', (runtime) => {
    expect(availableParadigms(runtime)).toContain('rest');
  });
});

describe('contradiction 4 — ORM availability per runtime', () => {
  it('never offers Node-only ORMs to Python or Go', () => {
    for (const runtime of ['python-fastapi', 'go-gin'] as const) {
      const orms = availableOrms(runtime, 'postgres');
      expect(orms).not.toContain('prisma');
      expect(orms).not.toContain('drizzle');
      expect(availableOrms(runtime, 'mongodb')).not.toContain('mongoose');
    }
  });

  it('offers runtime-appropriate equivalents', () => {
    expect(availableOrms('python-fastapi', 'postgres')).toEqual(['sqlmodel', 'sqlalchemy']);
    expect(availableOrms('go-gin', 'postgres')).toEqual(['gorm', 'sqlc']);
    expect(availableOrms('node-ts', 'postgres')).toEqual(['prisma', 'drizzle']);
  });

  it('explains a Node-only ORM rejection specifically', () => {
    expect(ormUnavailableReason('go-gin', 'postgres', 'prisma')).toMatch(/Node\.js library/);
  });

  it.each(API_RUNTIMES)('has a valid default ORM for %s with each database', (runtime) => {
    for (const db of ['postgres', 'mongodb', 'none'] as const) {
      const orm = defaultOrm(runtime, db);
      expect(availableOrms(runtime, db)).toContain(orm);
    }
  });

  it('resolves "none" database to the "none" ORM', () => {
    expect(defaultOrm('node-ts', 'none')).toBe('none');
  });
});

describe('contradiction 5 — deployment target reshapes Step 4', () => {
  it('enables all four sections for Kubernetes targets', () => {
    for (const target of ['aws-eks', 'onprem-k8s'] as const) {
      const s = step4Sections(target);
      expect(s).toMatchObject({ container: true, kubernetes: true, gitops: true, cicd: true });
      expect(s.banner).toBeUndefined();
    }
  });

  it('hides Kubernetes and GitOps for Cloudflare/Vercel, and says why', () => {
    const s = step4Sections('cloudflare-vercel');
    expect(s.kubernetes).toBe(false);
    expect(s.gitops).toBe(false);
    expect(s.cicd).toBe(true);
    expect(s.banner).toMatch(/managed platform/i);
  });
});

describe('module dependency gates', () => {
  const full = { hasApi: true, hasDatabase: true, authMode: 'jwt' as const };
  const bare = { hasApi: false, hasDatabase: false, authMode: 'none' as const };

  it.each(UI_MODULES)('enables %s when all requirements are met', (mod) => {
    expect(moduleGate(mod, full).enabled).toBe(true);
  });

  it.each(UI_MODULES)('disables %s with a stated reason when nothing is configured', (mod) => {
    const gate = moduleGate(mod, bare);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBeDefined();
    expect(gate.reason).toMatch(/Step 3/);
  });

  it('requires a database for user management even when auth exists', () => {
    const gate = moduleGate('userManagement', {
      hasApi: true,
      hasDatabase: false,
      authMode: 'jwt',
    });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toMatch(/database/i);
  });

  it('requires an API for Stripe billing because of the webhook endpoint', () => {
    const gate = moduleGate('stripeBilling', {
      hasApi: false,
      hasDatabase: true,
      authMode: 'jwt',
    });
    expect(gate.reason).toMatch(/webhook/i);
  });

  it('allows auth layouts without a database', () => {
    expect(
      moduleGate('authLayouts', { hasApi: true, hasDatabase: false, authMode: 'oauth' }).enabled,
    ).toBe(true);
  });
});
