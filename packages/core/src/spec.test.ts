/**
 * Schema-level enforcement.
 *
 * The wizard prevents these combinations in the UI; these tests prove the schema rejects them
 * too. The UI is convenience, the schema is truth — a crafted request must not get through.
 */

import { describe, expect, it } from 'vitest';
import { apiOnlyGoSpec, spineSpec, uiOnlyVercelSpec } from './fixtures.js';
import { safeParseProjectSpec } from './spec.js';

/** Returns the joined issue paths + messages for a spec expected to fail. */
function issues(input: unknown): string[] {
  const result = safeParseProjectSpec(input);
  if (result.success) return [];
  return result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('valid fixtures', () => {
  it('accepts the P1 spine spec', () => {
    const result = safeParseProjectSpec(spineSpec());
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('accepts the UI-only Vercel spec', () => {
    expect(safeParseProjectSpec(uiOnlyVercelSpec()).success).toBe(true);
  });

  it('accepts the API-only Go spec', () => {
    expect(safeParseProjectSpec(apiOnlyGoSpec()).success).toBe(true);
  });
});

describe('slug enforcement reaches the schema', () => {
  it('rejects a reserved slug even though it matches the regex', () => {
    const found = issues(spineSpec({ meta: { slug: 'argocd' } }));
    expect(found.join()).toMatch(/reserved/i);
  });

  it('rejects an uppercase slug', () => {
    expect(issues(spineSpec({ meta: { slug: 'Acme-Health' } })).length).toBeGreaterThan(0);
  });
});

describe('contradiction 3 — tRPC outside Node is rejected server-side', () => {
  it('rejects tRPC on FastAPI', () => {
    const found = issues(
      apiOnlyGoSpec({
        api: { runtime: 'python-fastapi', paradigm: 'trpc', database: 'postgres', orm: 'sqlmodel' },
      }),
    );
    expect(found.join()).toMatch(/tRPC requires the Node\.js/);
  });

  it('accepts tRPC on Node', () => {
    expect(safeParseProjectSpec(spineSpec({ api: { paradigm: 'trpc' } })).success).toBe(true);
  });
});

describe('contradiction 4 — ORM must match runtime', () => {
  it('rejects Prisma on Go', () => {
    const found = issues(apiOnlyGoSpec({ api: { orm: 'prisma' } }));
    expect(found.join()).toMatch(/api\.orm/);
  });

  it('rejects an ORM when no database is selected', () => {
    const found = issues(spineSpec({ api: { database: 'none', orm: 'prisma' } }));
    expect(found.join()).toMatch(/api\.orm/);
  });
});

describe('contradiction 5 — Vercel target cannot carry Kubernetes config', () => {
  it('rejects k8s.enabled on a Cloudflare/Vercel target', () => {
    const found = issues(uiOnlyVercelSpec({ ops: { k8s: { enabled: true } } }));
    expect(found.join()).toMatch(/Cloudflare \/ Vercel/);
  });

  it('rejects gitops.enabled on a Cloudflare/Vercel target', () => {
    const found = issues(uiOnlyVercelSpec({ ops: { gitops: { enabled: true } } }));
    expect(found.join()).toMatch(/ops\.gitops\.enabled/);
  });

  it('rejects ArgoCD without Kubernetes manifests', () => {
    const found = issues(
      spineSpec({ ops: { k8s: { enabled: false }, gitops: { enabled: true } } }),
    );
    expect(found.join()).toMatch(/ArgoCD requires Kubernetes/);
  });
});

describe('module dependency gates reach the schema', () => {
  it('rejects userManagement without a database', () => {
    const found = issues(
      spineSpec({
        api: { database: 'none', orm: 'none' },
        ui: { modules: { userManagement: true, settingsRbac: false, authLayouts: false } },
      }),
    );
    expect(found.join()).toMatch(/ui\.modules\.userManagement/);
  });

  it('rejects settingsRbac when auth is disabled', () => {
    const found = issues(
      spineSpec({
        api: { middleware: { auth: 'none' } },
        ui: { modules: { authLayouts: false, settingsRbac: true } },
      }),
    );
    expect(found.join()).toMatch(/ui\.modules\.settingsRbac/);
  });

  it('rejects stripeBilling with no API layer', () => {
    const found = issues(uiOnlyVercelSpec({ ui: { modules: { stripeBilling: true } } }));
    expect(found.join()).toMatch(/ui\.modules\.stripeBilling/);
  });
});

describe('structural coherence', () => {
  it('rejects a project with neither UI nor API', () => {
    const found = issues(spineSpec({ ui: null, api: null }));
    expect(found.join()).toMatch(/must include a UI layer, an API layer, or both/);
  });

  it('rejects HPA max below min', () => {
    const found = issues(spineSpec({ ops: { k8s: { hpa: { min: 5, max: 2 } } } }));
    expect(found.join()).toMatch(/greater than or equal/);
  });

  it('rejects Kubernetes deployment with no container image', () => {
    const found = issues(spineSpec({ ops: { container: { strategy: 'none' } } }));
    expect(found.join()).toMatch(/requires a container image/);
  });

  it('rejects an unknown specVersion', () => {
    expect(issues(spineSpec({ specVersion: 99 as never })).length).toBeGreaterThan(0);
  });

  it('rejects unparseable input outright', () => {
    expect(safeParseProjectSpec(null).success).toBe(false);
    expect(safeParseProjectSpec({}).success).toBe(false);
    expect(safeParseProjectSpec('not a spec').success).toBe(false);
  });
});
