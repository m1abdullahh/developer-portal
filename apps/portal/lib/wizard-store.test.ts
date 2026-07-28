/**
 * The wizard's one invariant: no sequence of clicks can produce a spec the schema rejects.
 *
 * These tests drive the store the way a user drives the UI — set a runtime, set a database,
 * toggle a layer — and assert the result still parses. The compatibility matrix has its own
 * tests in @idp/core; what is under test here is that the wizard actually *applies* it rather
 * than merely displaying it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { safeParseProjectSpec, spineSpec } from '@idp/core';
import {
  DEFAULT_API,
  DEFAULT_UI,
  defaultOps,
  initialState,
  isSubmittable,
  repair,
  repairApi,
  repairModules,
  repairOps,
  toSpec,
  useWizard,
  validateStep,
  type WizardState,
} from './wizard-store';

/** A complete, valid starting point — the spine, as the wizard would hold it. */
function validState(): Pick<WizardState, 'meta' | 'ui' | 'api' | 'ops'> {
  const spec = spineSpec();
  return { meta: spec.meta, ui: spec.ui, api: spec.api, ops: spec.ops };
}

beforeEach(() => {
  useWizard.setState(initialState());
});

describe('repairApi — contradictions 3 and 4', () => {
  // tRPC's whole value is end-to-end TypeScript inference; there is no Go equivalent.
  it('moves tRPC off a runtime that cannot host it', () => {
    const repaired = repairApi({ ...DEFAULT_API, runtime: 'go-gin', paradigm: 'trpc' });
    expect(repaired.paradigm).not.toBe('trpc');
    expect(repaired.paradigm).toBe('rest');
  });

  it('keeps tRPC on Node, where it is valid', () => {
    const repaired = repairApi({ ...DEFAULT_API, runtime: 'node-ts', paradigm: 'trpc' });
    expect(repaired.paradigm).toBe('trpc');
  });

  it('replaces a Node-only ORM when the runtime changes', () => {
    const repaired = repairApi({ ...DEFAULT_API, runtime: 'python-fastapi', orm: 'prisma' });
    expect(repaired.orm).toBe('sqlmodel');
  });

  it('forces the ORM to none when the database is removed', () => {
    const repaired = repairApi({ ...DEFAULT_API, database: 'none', orm: 'prisma' });
    expect(repaired.orm).toBe('none');
  });
});

describe('repairModules — page module prerequisites', () => {
  it('switches off user management when the database goes away', () => {
    const ui = { ...DEFAULT_UI, modules: { ...DEFAULT_UI.modules, userManagement: true } };
    const repaired = repairModules(ui, { ...DEFAULT_API, database: 'none', orm: 'none' });
    expect(repaired.modules.userManagement).toBe(false);
  });

  it('switches off auth layouts when authentication is disabled', () => {
    const ui = { ...DEFAULT_UI, modules: { ...DEFAULT_UI.modules, authLayouts: true } };
    const repaired = repairModules(ui, {
      ...DEFAULT_API,
      middleware: { ...DEFAULT_API.middleware, auth: 'none' },
    });
    expect(repaired.modules.authLayouts).toBe(false);
  });

  it('switches off every module when the API layer is removed', () => {
    const ui = {
      ...DEFAULT_UI,
      modules: { authLayouts: true, userManagement: true, stripeBilling: true, settingsRbac: true },
    };
    const repaired = repairModules(ui, null);
    expect(Object.values(repaired.modules).every((v) => v === false)).toBe(true);
  });

  it('leaves a satisfied module alone', () => {
    const ui = { ...DEFAULT_UI, modules: { ...DEFAULT_UI.modules, userManagement: true } };
    expect(repairModules(ui, DEFAULT_API).modules.userManagement).toBe(true);
  });
});

describe('repairOps — contradiction 5', () => {
  it('strips Kubernetes and GitOps for a managed platform', () => {
    const repaired = repairOps(defaultOps('aws-eks'), 'cloudflare-vercel');
    expect(repaired.k8s.enabled).toBe(false);
    expect(repaired.gitops.enabled).toBe(false);
    expect(repaired.cicd.argoSync).toBe(false);
  });

  it('leaves them alone for a Kubernetes target', () => {
    const repaired = repairOps(defaultOps('aws-eks'), 'aws-eks');
    expect(repaired.k8s.enabled).toBe(true);
  });
});

describe('the store never reaches an invalid state', () => {
  it('starts invalid only because required text is empty', () => {
    const state = useWizard.getState();
    const errors = validateStep(state, 1).errors;
    // Blank required fields — not a contradiction. The org is blank too unless
    // NEXT_PUBLIC_GITHUB_ORG is set, which it is not in tests.
    expect(Object.keys(errors).sort()).toEqual([
      'meta.clientName',
      'meta.projectName',
      'meta.repo.org',
      'meta.slug',
    ]);
  });

  it('stays valid when the runtime changes under a selected paradigm', () => {
    useWizard.setState(validState());
    useWizard.getState().setParadigm('trpc');
    expect(useWizard.getState().api?.paradigm).toBe('trpc');

    useWizard.getState().setRuntime('go-gin');

    expect(useWizard.getState().api?.paradigm).toBe('rest');
    expect(safeParseProjectSpec(toSpec(useWizard.getState())).success).toBe(true);
  });

  it('stays valid when the database is removed under a selected ORM and module', () => {
    useWizard.setState(validState());
    useWizard.getState().toggleModule('userManagement', true);
    useWizard.getState().setDatabase('none');

    const state = useWizard.getState();
    expect(state.api?.orm).toBe('none');
    expect(state.ui?.modules.userManagement).toBe(false);
    expect(isSubmittable(state)).toBe(true);
  });

  it('stays valid when the deployment target moves to a managed platform', () => {
    useWizard.setState(validState());
    useWizard.getState().setDeploymentTarget('cloudflare-vercel');

    const state = useWizard.getState();
    expect(state.ops.k8s.enabled).toBe(false);
    expect(state.ops.gitops.enabled).toBe(false);
    expect(isSubmittable(state)).toBe(true);
  });

  it('follows the registry default when the target changes, unless overridden', () => {
    useWizard.setState(validState());
    // spineSpec targets EKS, whose default registry is ECR.
    expect(useWizard.getState().ops.cicd.registry).toBe('ecr');

    useWizard.getState().setDeploymentTarget('onprem-k8s');
    expect(useWizard.getState().ops.cicd.registry).toBe('ghcr');

    useWizard.getState().setOps({ cicd: { registry: 'dockerhub' } });
    useWizard.getState().setDeploymentTarget('aws-eks');
    expect(useWizard.getState().ops.cicd.registry).toBe('dockerhub');
  });

  it('stays valid when a layer is removed entirely', () => {
    useWizard.setState(validState());
    useWizard.getState().toggleUiLayer(false);

    expect(useWizard.getState().ui).toBeNull();
    expect(isSubmittable(useWizard.getState())).toBe(true);
  });

  it('rejects removing both layers — there would be nothing to generate', () => {
    useWizard.setState(validState());
    useWizard.getState().toggleUiLayer(false);
    useWizard.getState().toggleApiLayer(false);

    expect(isSubmittable(useWizard.getState())).toBe(false);
  });

  // Restoring yesterday's draft after a compatibility rule changed must not reintroduce a state
  // the schema now rejects.
  it('repairs a hydrated draft rather than trusting it', () => {
    useWizard.getState().hydrate({
      ...validState(),
      api: { ...DEFAULT_API, runtime: 'go-gin', paradigm: 'trpc', orm: 'prisma' },
    });

    const api = useWizard.getState().api;
    expect(api?.paradigm).toBe('rest');
    expect(api?.orm).toBe('gorm');
  });
});

describe('validateStep', () => {
  it('reports only the errors belonging to the requested step', () => {
    const state = { ...validState(), meta: { ...validState().meta, projectName: '' } };

    expect(validateStep(state, 1).valid).toBe(false);
    expect(validateStep(state, 1).errors['meta.projectName']).toBeTruthy();
    // Step 3 is untouched by a bad project name.
    expect(validateStep(state, 3).valid).toBe(true);
  });

  // Not a generic "invalid" — validateSlug explains which rule was broken, and the two rules
  // produce genuinely different messages. `CON` is checked lowercase because the format rule
  // fires first on uppercase input and would mask the reserved-word rule.
  it('reports an invalid slug with the specific reason', () => {
    const reserved = { ...validState(), meta: { ...validState().meta, slug: 'con' } };
    expect(validateStep(reserved, 1).errors['meta.slug']?.toLowerCase()).toContain('reserved');

    const malformed = { ...validState(), meta: { ...validState().meta, slug: 'Bad_Slug' } };
    expect(validateStep(malformed, 1).errors['meta.slug']?.toLowerCase()).toContain('lowercase');
  });

  it('passes every step for a complete spine', () => {
    for (const step of [1, 2, 3, 4, 5] as const) {
      expect(validateStep(validState(), step).valid).toBe(true);
    }
  });
});

describe('toSpec', () => {
  it('produces an object the schema accepts', () => {
    expect(safeParseProjectSpec(toSpec(validState())).success).toBe(true);
  });

  it('round-trips the spine unchanged', () => {
    expect(toSpec(validState())).toEqual(spineSpec());
  });
});

describe('repair is idempotent', () => {
  // Applied after every action, so a second pass must never differ from the first — otherwise
  // the UI could oscillate between two states on repeated edits.
  it('produces the same result when applied twice', () => {
    const once = repair({ ...initialState(), ...validState() });
    expect(repair(once)).toEqual(once);
  });
});
