/**
 * The wizard's state.
 *
 * One rule governs this file: **selecting an option must never leave the spec in a state the
 * schema would reject.** The compatibility matrix in `@idp/core` says tRPC cannot run on Go, so
 * switching the runtime to Go while tRPC is selected has to move the paradigm too — silently and
 * immediately, not at submit time with an error.
 *
 * Doing that repair here rather than in each step component means every entry point gets it:
 * clicking a card, restoring a draft, or loading someone else's shared configuration.
 */

import { create } from 'zustand';
import {
  CURRENT_SPEC_VERSION,
  availableOrms,
  availableParadigms,
  defaultOrm,
  defaultRegistry,
  moduleGate,
  safeParseProjectSpec,
  targetUsesKubernetes,
  type ApiParadigm,
  type ApiRuntime,
  type AuthMode,
  type Database,
  type DeploymentTarget,
  type Orm,
  type ProjectSpec,
  type UiFramework,
  type UiModule,
  type UiState,
  type UiStyling,
} from '@idp/core';

export type WizardStep = 1 | 2 | 3 | 4 | 5;
export const LAST_CONFIG_STEP: WizardStep = 4;

/**
 * The wizard's working shape.
 *
 * `ui` and `api` are nullable in ProjectSpec to express "no such layer", and the wizard needs
 * the same freedom — a UI-only project is a legitimate answer to step 3, not an incomplete one.
 */
export interface WizardState {
  step: WizardStep;
  meta: ProjectSpec['meta'];
  ui: ProjectSpec['ui'];
  api: ProjectSpec['api'];
  ops: ProjectSpec['ops'];
  /** Steps the user has actually visited — drives which validation errors are shown. */
  visited: Set<WizardStep>;
  slugStatus: 'idle' | 'checking' | 'available' | 'taken' | 'unknown';
  /** `| undefined` is explicit because the project runs with `exactOptionalPropertyTypes`. */
  slugMessage?: string | undefined;
  submitting: boolean;
  submitError?: string | undefined;
}

export interface WizardActions {
  goTo: (step: WizardStep) => void;
  next: () => void;
  back: () => void;

  setMeta: (patch: Partial<ProjectSpec['meta']>) => void;
  setRepo: (patch: Partial<ProjectSpec['meta']['repo']>) => void;
  setDeploymentTarget: (target: DeploymentTarget) => void;

  toggleUiLayer: (enabled: boolean) => void;
  setFramework: (framework: UiFramework) => void;
  setStyling: (styling: UiStyling) => void;
  setUiState: (state: UiState) => void;
  toggleModule: (module: UiModule, enabled: boolean) => void;

  toggleApiLayer: (enabled: boolean) => void;
  setRuntime: (runtime: ApiRuntime) => void;
  setParadigm: (paradigm: ApiParadigm) => void;
  setDatabase: (database: Database) => void;
  setOrm: (orm: Orm) => void;
  setAuthMode: (mode: AuthMode) => void;
  setMiddleware: (
    patch: Partial<ProjectSpec['api'] extends null ? never : MiddlewarePatch>,
  ) => void;
  setCache: (enabled: boolean) => void;

  setOps: (patch: DeepPartialOps) => void;

  setSlugStatus: (status: WizardState['slugStatus'], message?: string) => void;
  setSubmitting: (submitting: boolean, error?: string) => void;
  hydrate: (draft: Partial<WizardState>) => void;
  reset: () => void;
}

type MiddlewarePatch = {
  auth: AuthMode;
  rateLimit: boolean;
  cors: boolean;
  validation: boolean;
  logging: boolean;
};

type DeepPartialOps = {
  container?: Partial<ProjectSpec['ops']['container']>;
  k8s?: Partial<Omit<ProjectSpec['ops']['k8s'], 'hpa' | 'resources'>> & {
    hpa?: Partial<ProjectSpec['ops']['k8s']['hpa']>;
    resources?: {
      requests?: Partial<ProjectSpec['ops']['k8s']['resources']['requests']>;
      limits?: Partial<ProjectSpec['ops']['k8s']['resources']['limits']>;
    };
  };
  gitops?: Partial<ProjectSpec['ops']['gitops']>;
  cicd?: Partial<ProjectSpec['ops']['cicd']>;
};

// ── defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_UI: NonNullable<ProjectSpec['ui']> = {
  framework: 'nextjs-app',
  styling: 'tailwind-shadcn',
  state: 'zustand',
  modules: { authLayouts: false, userManagement: false, stripeBilling: false, settingsRbac: false },
};

export const DEFAULT_API: NonNullable<ProjectSpec['api']> = {
  runtime: 'node-ts',
  paradigm: 'rest',
  database: 'postgres',
  orm: 'prisma',
  cache: false,
  middleware: { auth: 'jwt', rateLimit: true, cors: true, validation: true, logging: true },
};

export function defaultOps(target: DeploymentTarget): ProjectSpec['ops'] {
  const k8s = targetUsesKubernetes(target);
  return {
    container: { strategy: 'distroless', rootless: true, multiArch: false },
    k8s: {
      enabled: k8s,
      namespace: 'default',
      ingress: 'nginx',
      replicas: 2,
      hpa: { enabled: true, min: 2, max: 10, cpuTargetPercent: 70 },
      resources: {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
    },
    gitops: { enabled: k8s, syncPolicy: 'auto' },
    cicd: {
      registry: defaultRegistry(target),
      lint: true,
      test: true,
      buildPush: true,
      argoSync: k8s,
    },
  };
}

export function initialState(): WizardState {
  return {
    step: 1,
    meta: {
      projectName: '',
      slug: '',
      clientName: '',
      deploymentTarget: 'aws-eks',
      repo: {
        org: process.env.NEXT_PUBLIC_GITHUB_ORG ?? '',
        visibility: 'private',
        defaultBranch: 'main',
        teamSlugs: [],
        branchProtection: true,
      },
    },
    ui: DEFAULT_UI,
    api: DEFAULT_API,
    ops: defaultOps('aws-eks'),
    visited: new Set<WizardStep>([1]),
    slugStatus: 'idle',
    submitting: false,
  };
}

// ── repair rules ─────────────────────────────────────────────────────────────

/**
 * Forces the API selection back into a combination the schema accepts.
 *
 * Called after every change to runtime or database. Returning a repaired copy rather than
 * validating-and-complaining is what keeps the UI from ever showing an impossible state.
 */
export function repairApi(api: NonNullable<ProjectSpec['api']>): NonNullable<ProjectSpec['api']> {
  const paradigms = availableParadigms(api.runtime);
  const paradigm = paradigms.includes(api.paradigm) ? api.paradigm : (paradigms[0] ?? 'rest');

  const orms = availableOrms(api.runtime, api.database);
  const orm = orms.includes(api.orm) ? api.orm : defaultOrm(api.runtime, api.database);

  return { ...api, paradigm, orm };
}

/**
 * Turns off page modules whose prerequisites have gone away.
 *
 * Choosing "no database" in step 3 must switch off User Management in step 2 — leaving it on
 * produces a spec the schema rejects, and the user would see the failure two steps away from
 * the choice that caused it.
 */
export function repairModules(
  ui: NonNullable<ProjectSpec['ui']>,
  api: ProjectSpec['api'],
): NonNullable<ProjectSpec['ui']> {
  const input = {
    hasApi: api !== null,
    hasDatabase: api !== null && api.database !== 'none',
    authMode: api?.middleware.auth ?? ('none' as const),
  };

  const modules = { ...ui.modules };
  for (const key of Object.keys(modules) as UiModule[]) {
    if (modules[key] && !moduleGate(key, input).enabled) modules[key] = false;
  }
  return { ...ui, modules };
}

/** Kubernetes and GitOps cannot apply to a managed platform (contradiction 5). */
export function repairOps(ops: ProjectSpec['ops'], target: DeploymentTarget): ProjectSpec['ops'] {
  if (targetUsesKubernetes(target)) return ops;
  return {
    ...ops,
    k8s: { ...ops.k8s, enabled: false },
    gitops: { ...ops.gitops, enabled: false },
    cicd: { ...ops.cicd, argoSync: false },
  };
}

/** Applies every repair rule at once. The single place state becomes consistent again. */
export function repair(state: WizardState): WizardState {
  const api = state.api ? repairApi(state.api) : null;
  const ui = state.ui ? repairModules(state.ui, api) : null;
  const ops = repairOps(state.ops, state.meta.deploymentTarget);
  return { ...state, api, ui, ops };
}

// ── spec assembly & validation ───────────────────────────────────────────────

export function toSpec(state: Pick<WizardState, 'meta' | 'ui' | 'api' | 'ops'>): unknown {
  return {
    specVersion: CURRENT_SPEC_VERSION,
    meta: state.meta,
    ui: state.ui,
    api: state.api,
    ops: state.ops,
  };
}

export interface StepValidation {
  valid: boolean;
  /** Field path → message, e.g. `meta.slug`. */
  errors: Record<string, string>;
}

const STEP_PREFIXES: Record<WizardStep, string[]> = {
  1: ['meta'],
  2: ['ui'],
  3: ['api'],
  4: ['ops'],
  5: ['meta', 'ui', 'api', 'ops'],
};

/**
 * Validates the whole spec, then reports only the errors belonging to one step.
 *
 * Validating a partial object would need a second, parallel schema — and two schemas drift.
 * The full parse runs every time and the results are filtered, so the wizard and the server
 * always agree about what is wrong.
 */
export function validateStep(
  state: Pick<WizardState, 'meta' | 'ui' | 'api' | 'ops'>,
  step: WizardStep,
): StepValidation {
  const result = safeParseProjectSpec(toSpec(state));
  if (result.success) return { valid: true, errors: {} };

  const prefixes = STEP_PREFIXES[step];
  const errors: Record<string, string> = {};

  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    const root = String(issue.path[0] ?? '');
    if (!prefixes.includes(root)) continue;
    errors[path] ??= issue.message;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** True when the whole spec parses — the only condition under which submit is allowed. */
export function isSubmittable(state: Pick<WizardState, 'meta' | 'ui' | 'api' | 'ops'>): boolean {
  return safeParseProjectSpec(toSpec(state)).success;
}

// ── store ────────────────────────────────────────────────────────────────────

export const useWizard = create<WizardState & WizardActions>((set) => ({
  ...initialState(),

  goTo: (step) => set((s) => ({ step, visited: new Set(s.visited).add(step) })),
  next: () =>
    set((s) => {
      const step = Math.min(5, s.step + 1) as WizardStep;
      return { step, visited: new Set(s.visited).add(step) };
    }),
  back: () => set((s) => ({ step: Math.max(1, s.step - 1) as WizardStep })),

  setMeta: (patch) => set((s) => repair({ ...s, meta: { ...s.meta, ...patch } })),
  setRepo: (patch) =>
    set((s) => repair({ ...s, meta: { ...s.meta, repo: { ...s.meta.repo, ...patch } } })),

  setDeploymentTarget: (target) =>
    set((s) => {
      const meta = { ...s.meta, deploymentTarget: target };
      // The registry default follows the target — ECR on EKS, GHCR elsewhere — but only when
      // the user has not overridden it, which is why it compares against the old default.
      const registry =
        s.ops.cicd.registry === defaultRegistry(s.meta.deploymentTarget)
          ? defaultRegistry(target)
          : s.ops.cicd.registry;
      const k8s = targetUsesKubernetes(target);
      return repair({
        ...s,
        meta,
        ops: {
          ...s.ops,
          k8s: { ...s.ops.k8s, enabled: k8s && s.ops.k8s.enabled },
          gitops: { ...s.ops.gitops, enabled: k8s && s.ops.gitops.enabled },
          cicd: { ...s.ops.cicd, registry },
        },
      });
    }),

  toggleUiLayer: (enabled) =>
    set((s) => repair({ ...s, ui: enabled ? (s.ui ?? DEFAULT_UI) : null })),
  setFramework: (framework) =>
    set((s) => (s.ui ? repair({ ...s, ui: { ...s.ui, framework } }) : s)),
  setStyling: (styling) => set((s) => (s.ui ? repair({ ...s, ui: { ...s.ui, styling } }) : s)),
  setUiState: (state) => set((s) => (s.ui ? repair({ ...s, ui: { ...s.ui, state } }) : s)),
  toggleModule: (module, enabled) =>
    set((s) =>
      s.ui ? repair({ ...s, ui: { ...s.ui, modules: { ...s.ui.modules, [module]: enabled } } }) : s,
    ),

  toggleApiLayer: (enabled) =>
    set((s) => repair({ ...s, api: enabled ? (s.api ?? DEFAULT_API) : null })),
  setRuntime: (runtime) => set((s) => (s.api ? repair({ ...s, api: { ...s.api, runtime } }) : s)),
  setParadigm: (paradigm) =>
    set((s) => (s.api ? repair({ ...s, api: { ...s.api, paradigm } }) : s)),
  setDatabase: (database) =>
    set((s) =>
      s.api
        ? repair({
            ...s,
            api: { ...s.api, database, orm: defaultOrm(s.api.runtime, database) },
          })
        : s,
    ),
  setOrm: (orm) => set((s) => (s.api ? repair({ ...s, api: { ...s.api, orm } }) : s)),
  setAuthMode: (auth) =>
    set((s) =>
      s.api ? repair({ ...s, api: { ...s.api, middleware: { ...s.api.middleware, auth } } }) : s,
    ),
  setMiddleware: (patch) =>
    set((s) =>
      s.api
        ? repair({ ...s, api: { ...s.api, middleware: { ...s.api.middleware, ...patch } } })
        : s,
    ),
  setCache: (cache) => set((s) => (s.api ? repair({ ...s, api: { ...s.api, cache } }) : s)),

  setOps: (patch) =>
    set((s) =>
      repair({
        ...s,
        ops: {
          ...s.ops,
          container: { ...s.ops.container, ...patch.container },
          k8s: {
            ...s.ops.k8s,
            ...patch.k8s,
            hpa: { ...s.ops.k8s.hpa, ...patch.k8s?.hpa },
            resources: {
              requests: { ...s.ops.k8s.resources.requests, ...patch.k8s?.resources?.requests },
              limits: { ...s.ops.k8s.resources.limits, ...patch.k8s?.resources?.limits },
            },
          },
          gitops: { ...s.ops.gitops, ...patch.gitops },
          cicd: { ...s.ops.cicd, ...patch.cicd },
        },
      }),
    ),

  setSlugStatus: (slugStatus, slugMessage) => set({ slugStatus, slugMessage }),
  setSubmitting: (submitting, submitError) => set({ submitting, submitError }),

  // Repaired on the way in: a draft saved before a compatibility rule changed must not be
  // restored into a state the schema now rejects.
  hydrate: (draft) => set((s) => repair({ ...s, ...draft })),
  reset: () => set(initialState()),
}));
