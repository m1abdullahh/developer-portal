/**
 * Contract test: every option in the spec has presentation copy.
 *
 * `Record<T, OptionMeta>` already fails to compile when an enum gains a value, which covers the
 * common case. These tests cover what the type cannot: a label that is present but empty, or a
 * "coming in P2" note attached to an option that the P1 generator actually supports — which
 * would tell users a working feature is unavailable.
 */

import { describe, expect, it } from 'vitest';
import {
  API_PARADIGMS as PARADIGM_VALUES,
  API_RUNTIMES as RUNTIME_VALUES,
  AUTH_MODES as AUTH_VALUES,
  CONTAINER_STRATEGIES as CONTAINER_VALUES,
  DATABASES as DATABASE_VALUES,
  DEPLOYMENT_TARGETS as TARGET_VALUES,
  INGRESS_CONTROLLERS as INGRESS_VALUES,
  REGISTRIES as REGISTRY_VALUES,
  REPO_VISIBILITIES as VISIBILITY_VALUES,
  SYNC_POLICIES as POLICY_VALUES,
  UI_FRAMEWORKS as FRAMEWORK_VALUES,
  UI_MODULES as MODULE_VALUES,
  UI_STATES as STATE_VALUES,
  UI_STYLINGS as STYLING_VALUES,
} from '@idp/core';
import {
  API_PARADIGMS,
  API_RUNTIMES,
  AUTH_MODES,
  CONTAINER_STRATEGIES,
  DATABASES,
  DEPLOYMENT_TARGETS,
  INGRESS_CONTROLLERS,
  REGISTRIES,
  SYNC_POLICIES,
  UI_FRAMEWORKS,
  UI_MODULES,
  UI_STATES,
  UI_STYLINGS,
  VISIBILITIES,
  comingSoonReason,
} from './labels';

const TABLES = [
  ['deployment targets', TARGET_VALUES, DEPLOYMENT_TARGETS],
  ['visibilities', VISIBILITY_VALUES, VISIBILITIES],
  ['UI frameworks', FRAMEWORK_VALUES, UI_FRAMEWORKS],
  ['UI stylings', STYLING_VALUES, UI_STYLINGS],
  ['UI states', STATE_VALUES, UI_STATES],
  ['UI modules', MODULE_VALUES, UI_MODULES],
  ['API runtimes', RUNTIME_VALUES, API_RUNTIMES],
  ['API paradigms', PARADIGM_VALUES, API_PARADIGMS],
  ['databases', DATABASE_VALUES, DATABASES],
  ['auth modes', AUTH_VALUES, AUTH_MODES],
  ['container strategies', CONTAINER_VALUES, CONTAINER_STRATEGIES],
  ['ingress controllers', INGRESS_VALUES, INGRESS_CONTROLLERS],
  ['sync policies', POLICY_VALUES, SYNC_POLICIES],
  ['registries', REGISTRY_VALUES, REGISTRIES],
] as const;

describe.each(TABLES)('%s', (_name, values, table) => {
  it('labels every value, with no empty strings', () => {
    for (const value of values) {
      const meta = (table as Record<string, { label: string; description: string }>)[value];
      expect(meta, `missing label for "${value}"`).toBeDefined();
      expect(meta!.label.length).toBeGreaterThan(0);
      expect(meta!.description.length).toBeGreaterThan(0);
    }
  });
});

describe('the P1 spine is never marked as coming later', () => {
  // The combination the whole Phase 1 gate is measured against. Marking any of it "coming in P2"
  // would disable the only path that actually works.
  it.each([
    ['framework', UI_FRAMEWORKS['nextjs-app']],
    ['styling', UI_STYLINGS['tailwind-shadcn']],
    ['state', UI_STATES.zustand],
    ['runtime', API_RUNTIMES['node-ts']],
    ['paradigm', API_PARADIGMS.rest],
    ['database', DATABASES.postgres],
    ['auth', AUTH_MODES.jwt],
    ['container', CONTAINER_STRATEGIES.distroless],
  ])('%s is available now', (_label, meta) => {
    expect(meta.comingIn).toBeUndefined();
    expect(comingSoonReason(meta)).toBeUndefined();
  });

  it('offers "none" for optional layers without a coming-soon note', () => {
    expect(DATABASES.none.comingIn).toBeUndefined();
    expect(AUTH_MODES.none.comingIn).toBeUndefined();
    expect(CONTAINER_STRATEGIES.none.comingIn).toBeUndefined();
  });
});

describe('comingSoonReason', () => {
  /*
   * `go-gin`, and this target has now moved twice.
   *
   * It named Nuxt for the whole of P2, then `python-fastapi` when Nuxt shipped. FastAPI now ships
   * too — runtime, five middleware, REST/OpenAPI, SQLModel with Alembic, a distroless image and a
   * CI workflow that runs uv rather than npm — so asserting it is still "coming in P3" would have
   * failed, correctly. Go is the remaining one.
   *
   * The pattern is worth noticing: this test moves every time an option graduates, which is the
   * point. A coming-soon note nobody re-examines is how a working feature stays unselectable.
   */
  it('names the phase so the note is actionable', () => {
    const reason = comingSoonReason(API_RUNTIMES['go-gin']);
    expect(reason).toContain('P3');
  });

  it.each([
    ['nuxt', UI_FRAMEWORKS.nuxt],
    ['python-fastapi', API_RUNTIMES['python-fastapi']],
  ])('says nothing for %s, which actually ships', (_name, meta) => {
    // The inverse, and the failure mode that matters more: a note telling users a working
    // feature is unavailable is worse than a missing note, because nobody selects it to find out.
    expect(comingSoonReason(meta)).toBeUndefined();
  });
});
