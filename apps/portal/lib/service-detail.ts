/**
 * The service detail page's model (doc 07 §3) — everything about `/catalog/[org]/[slug]` that is
 * not a database call, a pipeline run or markup.
 *
 * The page answers "what is this service and how did it come to be" from one source: the
 * ProjectSpec stored when it was provisioned. That spec may have been written under an older
 * schema version, so everything here reads it as `unknown` and keeps going — a detail page that
 * refuses to open because one field moved is worse than one that shows what it can.
 */

import {
  API_PARADIGMS,
  API_RUNTIMES,
  AUTH_MODES,
  CONTAINER_STRATEGIES,
  DATABASES,
  DEPLOYMENT_TARGETS,
  INGRESS_CONTROLLERS,
  ORM_OPTIONS,
  REGISTRIES,
  SYNC_POLICIES,
  UI_FRAMEWORKS,
  UI_MODULES,
  UI_STATES,
  UI_STYLINGS,
  VISIBILITIES,
  type OptionMeta,
} from './labels';

// ── tabs and addresses ───────────────────────────────────────────────────────

export const SERVICE_TABS = ['overview', 'stack', 'api', 'deployments', 'activity'] as const;
export type ServiceTab = (typeof SERVICE_TABS)[number];

export const TAB_TITLES: Record<ServiceTab, string> = {
  overview: 'Overview',
  stack: 'Stack',
  api: 'API',
  deployments: 'Deployments',
  activity: 'Activity',
};

/** The tab lives in the URL, like every other piece of view state in the catalog. */
export function parseTab(raw: string | string[] | undefined): ServiceTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (SERVICE_TABS as readonly string[]).includes(value ?? '')
    ? (value as ServiceTab)
    : 'overview';
}

/**
 * A service is addressed by organisation *and* ID. The ID alone is unique only within an
 * organisation (`@@unique([org, slug])`), so `/catalog/<slug>` could name two services.
 */
export function serviceHref(org: string, slug: string, tab: ServiceTab = 'overview'): string {
  const base = `/catalog/${encodeURIComponent(org)}/${encodeURIComponent(slug)}`;
  return tab === 'overview' ? base : `${base}?tab=${tab}`;
}

// ── reading an unknown spec ──────────────────────────────────────────────────

function at(root: unknown, ...path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function labelled(map: Record<string, OptionMeta>, value: unknown): string | null {
  const raw = text(value);
  return raw === null ? null : (map[raw]?.label ?? raw);
}

function yesNo(value: unknown): string | null {
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null;
}

// ── the spec sheet ───────────────────────────────────────────────────────────

export interface SpecRow {
  label: string;
  value: string;
}

export interface SpecGroup {
  /** The wizard step the decisions were made in. */
  step: 1 | 2 | 3 | 4;
  title: string;
  rows: SpecRow[];
  /** Set instead of rows when the layer was deliberately left out. */
  absent?: string;
}

/**
 * Every wizard decision, grouped by the step it was made in, in the wizard's own words.
 *
 * A row appears only when the spec has a value for it: a spec from an older version simply shows
 * fewer rows, and the raw JSON below the sheet remains the complete record.
 */
export function specSheet(spec: unknown): SpecGroup[] {
  const rows = (pairs: Array<[string, string | null]>): SpecRow[] =>
    pairs.flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));

  const teams = at(spec, 'meta', 'repo', 'teamSlugs');
  const project: SpecGroup = {
    step: 1,
    title: 'Project',
    rows: rows([
      ['Project name', text(at(spec, 'meta', 'projectName'))],
      ['Technical ID', text(at(spec, 'meta', 'slug'))],
      ['Client', text(at(spec, 'meta', 'clientName'))],
      ['Deployment target', labelled(DEPLOYMENT_TARGETS, at(spec, 'meta', 'deploymentTarget'))],
      ['GitHub organisation', text(at(spec, 'meta', 'repo', 'org'))],
      ['Visibility', labelled(VISIBILITIES, at(spec, 'meta', 'repo', 'visibility'))],
      ['Default branch', text(at(spec, 'meta', 'repo', 'defaultBranch'))],
      [
        'Teams with access',
        Array.isArray(teams)
          ? teams.length === 0
            ? 'Every organisation member'
            : teams.join(', ')
          : null,
      ],
      ['Branch protection', yesNo(at(spec, 'meta', 'repo', 'branchProtection'))],
    ]),
  };

  const ui = at(spec, 'ui');
  const modules = at(ui, 'modules');
  const enabledModules =
    typeof modules === 'object' && modules !== null
      ? Object.entries(modules as Record<string, unknown>)
          .filter(([, on]) => on === true)
          .map(([key]) => (UI_MODULES as Record<string, OptionMeta>)[key]?.label ?? key)
      : null;
  const uiGroup: SpecGroup =
    ui === null || ui === undefined
      ? {
          step: 2,
          title: 'UI layer',
          rows: [],
          absent: 'No UI layer — this is an API-only project.',
        }
      : {
          step: 2,
          title: 'UI layer',
          rows: rows([
            ['Framework', labelled(UI_FRAMEWORKS, at(ui, 'framework'))],
            ['Styling', labelled(UI_STYLINGS, at(ui, 'styling'))],
            ['State management', labelled(UI_STATES, at(ui, 'state'))],
            [
              'Page modules',
              enabledModules === null
                ? null
                : enabledModules.length === 0
                  ? 'None'
                  : enabledModules.join(', '),
            ],
          ]),
        };

  const api = at(spec, 'api');
  const middleware = at(api, 'middleware');
  const MIDDLEWARE_NAMES: Record<string, string> = {
    rateLimit: 'Rate limiting',
    cors: 'CORS',
    validation: 'Request validation',
    logging: 'Structured logging',
  };
  const enabledMiddleware =
    typeof middleware === 'object' && middleware !== null
      ? Object.entries(MIDDLEWARE_NAMES)
          .filter(([key]) => (middleware as Record<string, unknown>)[key] === true)
          .map(([, name]) => name)
      : null;
  const database = text(at(api, 'database'));
  const apiGroup: SpecGroup =
    api === null || api === undefined
      ? {
          step: 3,
          title: 'API',
          rows: [],
          absent: 'No API layer — this is a frontend-only project.',
        }
      : {
          step: 3,
          title: 'API',
          rows: rows([
            ['Runtime', labelled(API_RUNTIMES, at(api, 'runtime'))],
            ['Paradigm', labelled(API_PARADIGMS, at(api, 'paradigm'))],
            ['Database', labelled(DATABASES, database)],
            // An ORM row under "no database" would only ever say "none", twice.
            [
              'ORM / data access',
              database === 'none' ? null : labelled(ORM_OPTIONS, at(api, 'orm')),
            ],
            ['Redis cache', yesNo(at(api, 'cache'))],
            ['Authentication', labelled(AUTH_MODES, at(middleware, 'auth'))],
            [
              'Middleware',
              enabledMiddleware === null
                ? null
                : enabledMiddleware.length === 0
                  ? 'None'
                  : enabledMiddleware.join(', '),
            ],
          ]),
        };

  const k8s = at(spec, 'ops', 'k8s');
  const k8sOn = at(k8s, 'enabled') === true;
  const hpaOn = at(k8s, 'hpa', 'enabled') === true;
  const gitopsOn = at(spec, 'ops', 'gitops', 'enabled') === true;
  const CI_STAGES: Record<string, string> = {
    lint: 'Lint',
    test: 'Test',
    buildPush: 'Build and push',
    argoSync: 'ArgoCD sync',
  };
  const cicd = at(spec, 'ops', 'cicd');
  const stages =
    typeof cicd === 'object' && cicd !== null
      ? Object.entries(CI_STAGES)
          .filter(([key]) => (cicd as Record<string, unknown>)[key] === true)
          .map(([, name]) => name)
      : null;
  const quantities = (kind: string): string | null => {
    const cpu = text(at(k8s, 'resources', kind, 'cpu'));
    const memory = text(at(k8s, 'resources', kind, 'memory'));
    return cpu && memory ? `${cpu} CPU · ${memory}` : null;
  };

  const ops: SpecGroup = {
    step: 4,
    title: 'DevOps',
    rows: rows([
      ['Container image', labelled(CONTAINER_STRATEGIES, at(spec, 'ops', 'container', 'strategy'))],
      ['Runs as non-root', yesNo(at(spec, 'ops', 'container', 'rootless'))],
      ['Multi-architecture build', yesNo(at(spec, 'ops', 'container', 'multiArch'))],
      ['Kubernetes', yesNo(at(k8s, 'enabled'))],
      ['Namespace', k8sOn ? text(at(k8s, 'namespace')) : null],
      ['Ingress', k8sOn ? labelled(INGRESS_CONTROLLERS, at(k8s, 'ingress')) : null],
      ['Replicas', k8sOn ? text(at(k8s, 'replicas')) : null],
      [
        'Autoscaling',
        !k8sOn
          ? null
          : hpaOn
            ? `${text(at(k8s, 'hpa', 'min')) ?? '?'}–${text(at(k8s, 'hpa', 'max')) ?? '?'} replicas at ${
                text(at(k8s, 'hpa', 'cpuTargetPercent')) ?? '?'
              }% CPU`
            : 'Off',
      ],
      ['Resource requests', k8sOn ? quantities('requests') : null],
      ['Resource limits', k8sOn ? quantities('limits') : null],
      ['GitOps (ArgoCD)', yesNo(at(spec, 'ops', 'gitops', 'enabled'))],
      [
        'Sync policy',
        gitopsOn ? labelled(SYNC_POLICIES, at(spec, 'ops', 'gitops', 'syncPolicy')) : null,
      ],
      ['Target cluster', gitopsOn ? text(at(spec, 'ops', 'gitops', 'targetCluster')) : null],
      ['Container registry', labelled(REGISTRIES, at(cicd, 'registry'))],
      [
        'Pipeline stages',
        stages === null ? null : stages.length === 0 ? 'None' : stages.join(' → '),
      ],
    ]),
  };

  return [project, uiGroup, apiGroup, ops];
}

// ── the API contract ─────────────────────────────────────────────────────────

export interface ApiEndpoint {
  path: string;
  purpose: string;
}

export interface ApiContract {
  paradigm: string;
  paradigmLabel: string;
  runtimeLabel: string | null;
  authLabel: string | null;
  endpoints: ApiEndpoint[];
}

const PROBES: ApiEndpoint[] = [
  { path: '/health', purpose: 'Liveness — the Kubernetes probe points here' },
  { path: '/ready', purpose: 'Readiness — reports each dependency the service declares' },
];

const PARADIGM_ENDPOINTS: Record<string, ApiEndpoint[]> = {
  rest: [
    { path: '/openapi.json', purpose: 'The OpenAPI document, built from the route schemas' },
    { path: '/docs', purpose: 'Interactive API reference' },
  ],
  graphql: [
    { path: '/graphql', purpose: 'The GraphQL endpoint (POST)' },
    { path: '/schema.graphql', purpose: 'The schema, as SDL' },
  ],
  trpc: [{ path: '/trpc', purpose: 'The tRPC router — procedures are called by name beneath it' }],
};

/**
 * The paths a generated service answers on. These are contractual — fixed by the generator, the
 * same for every service of that paradigm (doc 03 §2.1) — which is why the portal can state them
 * without asking the service.
 */
export function apiContract(spec: unknown): ApiContract | null {
  const api = at(spec, 'api');
  const paradigm = text(at(api, 'paradigm'));
  if (api === null || api === undefined || paradigm === null) return null;

  return {
    paradigm,
    paradigmLabel: labelled(API_PARADIGMS, paradigm) ?? paradigm,
    runtimeLabel: labelled(API_RUNTIMES, at(api, 'runtime')),
    authLabel: labelled(AUTH_MODES, at(api, 'middleware', 'auth')),
    endpoints: [...(PARADIGM_ENDPOINTS[paradigm] ?? []), ...PROBES],
  };
}

// ── quick links ──────────────────────────────────────────────────────────────

export interface QuickLink {
  label: string;
  href: string;
}

/**
 * Where to go next. A link appears only when it can be built from what is known — a repository
 * written by the filesystem driver has no Actions tab, and ArgoCD is linked only when the portal
 * has been told where it lives (`ARGOCD_URL`).
 */
export function quickLinks(input: {
  repoUrl: string;
  org: string;
  slug: string;
  spec: unknown;
  argocdUrl?: string | undefined;
}): QuickLink[] {
  const links: QuickLink[] = [];
  const onGitHub = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(input.repoUrl);
  const repo = input.repoUrl.replace(/\/$/, '');

  if (/^https?:\/\//.test(input.repoUrl)) links.push({ label: 'Repository', href: repo });
  if (onGitHub) {
    links.push({ label: 'Actions', href: `${repo}/actions` });
    links.push({ label: 'Pull requests', href: `${repo}/pulls` });
    if (text(at(input.spec, 'ops', 'cicd', 'registry')) === 'ghcr') {
      links.push({
        label: 'Container registry',
        href: `https://github.com/orgs/${encodeURIComponent(input.org)}/packages?repo_name=${encodeURIComponent(input.slug)}`,
      });
    }
  }

  const argo = input.argocdUrl?.replace(/\/$/, '');
  if (argo && /^https?:\/\//.test(argo) && at(input.spec, 'ops', 'gitops', 'enabled') === true) {
    // The generated Application manifests are named `<slug>-<environment>`.
    links.push({
      label: 'ArgoCD',
      href: `${argo}/applications?search=${encodeURIComponent(input.slug)}`,
    });
  }
  return links;
}

// ── generated output ─────────────────────────────────────────────────────────

export interface RecipeCount {
  recipeId: string;
  files: number;
}

/** How many of the generated files each recipe produced, largest first. */
export function recipeFileCounts(files: ReadonlyArray<{ producedBy: string }>): RecipeCount[] {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.producedBy, (counts.get(file.producedBy) ?? 0) + 1);
  return [...counts.entries()]
    .map(([recipeId, count]) => ({ recipeId, files: count }))
    .sort((a, b) => b.files - a.files || a.recipeId.localeCompare(b.recipeId));
}

export interface HelmEnvironment {
  /** `base` for values.yaml, otherwise the environment: dev, staging, prod. */
  name: string;
  path: string;
  content: string;
}

const ENVIRONMENT_ORDER = ['base', 'dev', 'staging', 'prod'];

/** The chart's values files, base first, then the environments in promotion order. */
export function helmEnvironments(
  files: ReadonlyArray<{ path: string; content: string | Uint8Array }>,
): HelmEnvironment[] {
  const found: HelmEnvironment[] = [];
  for (const file of files) {
    const match = /(^|\/)deploy\/values(?:-([a-z0-9]+))?\.yaml$/.exec(file.path);
    if (!match || typeof file.content !== 'string') continue;
    found.push({ name: match[2] ?? 'base', path: file.path, content: file.content });
  }
  const rank = (name: string): number => {
    const index = ENVIRONMENT_ORDER.indexOf(name);
    return index === -1 ? ENVIRONMENT_ORDER.length : index;
  };
  return found.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

// ── provisioning timelines ───────────────────────────────────────────────────

export interface StageEvent {
  stage: string;
  status: 'start' | 'done' | 'fail';
  ms?: number;
  message?: string;
}

export interface StageTiming {
  stage: string;
  outcome: 'done' | 'failed' | 'unfinished';
  ms: number | null;
  /** This stage's part of the job's measured time, 0–1. Drives the bar. */
  share: number;
  message: string | null;
}

/**
 * Collapses a job's stage events into one row per stage.
 *
 * The record is an event log — a `start`, then a `done` or a `fail` — so a stage's outcome is its
 * last event. A stage with only a `start` did not finish: the process died under it, which is
 * worth showing as such rather than as a stage that took no time.
 */
export function stageTimeline(events: readonly StageEvent[]): {
  stages: StageTiming[];
  totalMs: number;
} {
  const order: string[] = [];
  const last = new Map<string, StageEvent>();
  for (const event of events) {
    if (!last.has(event.stage)) order.push(event.stage);
    last.set(event.stage, event);
  }

  const totalMs = order.reduce((sum, stage) => sum + (last.get(stage)?.ms ?? 0), 0);
  const stages = order.map((stage): StageTiming => {
    const event = last.get(stage) as StageEvent;
    const ms = typeof event.ms === 'number' ? event.ms : null;
    return {
      stage,
      outcome: event.status === 'done' ? 'done' : event.status === 'fail' ? 'failed' : 'unfinished',
      ms,
      share: totalMs > 0 && ms !== null ? ms / totalMs : 0,
      message: event.message ?? null,
    };
  });
  return { stages, totalMs };
}

/** `840 ms`, `3.2 s`, `2 min 05 s` — stage timings span three orders of magnitude. */
export function formatStageMs(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1_000);
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}
