/**
 * Compatibility matrix — resolves the four contradictions in PRD v2.0's option lists.
 * See docs/plan/00-architecture.md §5 for the full rationale.
 *
 * The PRD presents each wizard option list as independent. They are not:
 *
 *   1. Nuxt is Vue, but all four state options are React libraries
 *   2. Nuxt is Vue, but two of three design systems are React-only
 *   3. tRPC's entire value is end-to-end TypeScript inference — it cannot target Python or Go
 *   4. Prisma / Drizzle / Mongoose are Node-only, but the PRD offers them for all runtimes
 *
 * Every rule here is enforced in two places: the wizard disables the option with a stated
 * reason, and the schema rejects it server-side. The UI is convenience; the schema is truth.
 */

import {
  isVueFramework,
  targetUsesKubernetes,
  type ApiParadigm,
  type ApiRuntime,
  type AuthMode,
  type Database,
  type DeploymentTarget,
  type Orm,
  type UiFramework,
  type UiModule,
  type UiState,
  type UiStyling,
} from './enums.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1 + 2. Vue substitutions — Nuxt gets the equivalent library, never the React one
// ─────────────────────────────────────────────────────────────────────────────

export interface Substitution {
  /** What the wizard shows as the option title once Nuxt is selected. */
  label: string;
  /** npm package(s) actually installed. */
  packages: string[];
  /** Shown as a subtitle so the user understands the swap rather than being surprised. */
  note: string;
}

const VUE_STATE_SUBSTITUTIONS: Record<UiState, Substitution> = {
  zustand: {
    label: 'Pinia',
    packages: ['pinia'],
    note: 'Vue equivalent of Zustand — the same minimal store model.',
  },
  'redux-toolkit': {
    label: 'Pinia (module pattern)',
    packages: ['pinia'],
    note: 'Vue equivalent of Redux Toolkit — structured stores with typed actions.',
  },
  'react-query': {
    label: 'TanStack Query (Vue)',
    packages: ['@tanstack/vue-query'],
    note: 'The Vue build of the same TanStack Query library.',
  },
  context: {
    label: 'Composables (provide/inject)',
    packages: [],
    note: "Vue's built-in dependency injection — no extra dependency, like React Context.",
  },
};

const REACT_STATE_PACKAGES: Record<UiState, string[]> = {
  zustand: ['zustand'],
  'redux-toolkit': ['@reduxjs/toolkit', 'react-redux'],
  'react-query': ['@tanstack/react-query'],
  context: [],
};

const VUE_STYLING_SUBSTITUTIONS: Record<UiStyling, Substitution> = {
  'tailwind-shadcn': {
    label: 'Tailwind CSS + shadcn-vue',
    packages: ['tailwindcss', 'shadcn-vue'],
    note: 'The Vue port of shadcn/ui, same component API.',
  },
  mui: {
    label: 'Vuetify 3',
    packages: ['vuetify'],
    note: 'Material Design for Vue — MUI is React-only.',
  },
  'css-modules': {
    label: 'CSS Modules',
    packages: [],
    note: 'Native to Vue SFCs via <style module>.',
  },
};

const REACT_STYLING_PACKAGES: Record<UiStyling, string[]> = {
  'tailwind-shadcn': ['tailwindcss'],
  mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
  'css-modules': [],
};

/** What the state option resolves to for a given framework. */
export function resolveState(
  framework: UiFramework,
  state: UiState,
): { label: string; packages: string[]; note?: string } {
  if (isVueFramework(framework)) {
    const sub = VUE_STATE_SUBSTITUTIONS[state];
    return { label: sub.label, packages: sub.packages, note: sub.note };
  }
  return { label: state, packages: REACT_STATE_PACKAGES[state] };
}

/** What the styling option resolves to for a given framework. */
export function resolveStyling(
  framework: UiFramework,
  styling: UiStyling,
): { label: string; packages: string[]; note?: string } {
  if (isVueFramework(framework)) {
    const sub = VUE_STYLING_SUBSTITUTIONS[styling];
    return { label: sub.label, packages: sub.packages, note: sub.note };
  }
  return { label: styling, packages: REACT_STYLING_PACKAGES[styling] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Paradigm availability per runtime
// ─────────────────────────────────────────────────────────────────────────────

const PARADIGMS_BY_RUNTIME: Record<ApiRuntime, readonly ApiParadigm[]> = {
  'node-ts': ['rest', 'graphql', 'trpc'],
  'python-fastapi': ['rest', 'graphql'],
  'go-gin': ['rest', 'graphql'],
};

export function availableParadigms(runtime: ApiRuntime): readonly ApiParadigm[] {
  return PARADIGMS_BY_RUNTIME[runtime];
}

export function paradigmUnavailableReason(
  runtime: ApiRuntime,
  paradigm: ApiParadigm,
): string | null {
  if (PARADIGMS_BY_RUNTIME[runtime].includes(paradigm)) return null;
  if (paradigm === 'trpc') {
    return 'tRPC requires the Node.js (TypeScript) runtime — its type inference has no Python or Go equivalent.';
  }
  return `${paradigm} is not available for this runtime.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ORM availability per runtime + database
// ─────────────────────────────────────────────────────────────────────────────

const ORMS_BY_RUNTIME_DB: Record<ApiRuntime, Record<Database, readonly Orm[]>> = {
  'node-ts': {
    postgres: ['prisma', 'drizzle'],
    mongodb: ['mongoose'],
    none: ['none'],
  },
  'python-fastapi': {
    postgres: ['sqlmodel', 'sqlalchemy'],
    mongodb: ['beanie'],
    none: ['none'],
  },
  'go-gin': {
    postgres: ['gorm', 'sqlc'],
    mongodb: ['mongo-go'],
    none: ['none'],
  },
};

const ORM_LABELS: Record<Orm, string> = {
  prisma: 'Prisma',
  drizzle: 'Drizzle ORM',
  mongoose: 'Mongoose',
  sqlmodel: 'SQLModel',
  sqlalchemy: 'SQLAlchemy 2.x',
  beanie: 'Beanie (async ODM)',
  gorm: 'GORM',
  sqlc: 'sqlc',
  'mongo-go': 'mongo-go-driver',
  none: 'None',
};

export function availableOrms(runtime: ApiRuntime, database: Database): readonly Orm[] {
  return ORMS_BY_RUNTIME_DB[runtime][database];
}

export function defaultOrm(runtime: ApiRuntime, database: Database): Orm {
  return availableOrms(runtime, database)[0] ?? 'none';
}

export function ormLabel(orm: Orm): string {
  return ORM_LABELS[orm];
}

export function ormUnavailableReason(
  runtime: ApiRuntime,
  database: Database,
  orm: Orm,
): string | null {
  if (availableOrms(runtime, database).includes(orm)) return null;
  const nodeOnly: Orm[] = ['prisma', 'drizzle', 'mongoose'];
  if (nodeOnly.includes(orm)) {
    return `${ORM_LABELS[orm]} is a Node.js library and cannot be used with this runtime.`;
  }
  return `${ORM_LABELS[orm]} does not support the selected database.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Deployment target reshapes Step 4
// ─────────────────────────────────────────────────────────────────────────────

export interface Step4Sections {
  container: boolean;
  kubernetes: boolean;
  gitops: boolean;
  cicd: boolean;
  /** Explains the shape of this step when sections are hidden. */
  banner?: string;
}

export function step4Sections(target: DeploymentTarget): Step4Sections {
  if (targetUsesKubernetes(target)) {
    return { container: true, kubernetes: true, gitops: true, cicd: true };
  }
  return {
    container: true,
    kubernetes: false,
    gitops: false,
    cicd: true,
    banner:
      'Cloudflare / Vercel is a managed platform — Kubernetes manifests and ArgoCD do not apply. ' +
      'Your pipeline will deploy directly to the platform instead.',
  };
}

export function defaultRegistry(target: DeploymentTarget) {
  return target === 'aws-eks' ? ('ecr' as const) : ('ghcr' as const);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Page-module dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleGateInput {
  hasApi: boolean;
  hasDatabase: boolean;
  authMode: AuthMode;
}

export interface ModuleGate {
  enabled: boolean;
  /** Shown inline on the disabled card so the user knows what to change. */
  reason?: string;
}

export function moduleGate(module: UiModule, input: ModuleGateInput): ModuleGate {
  const { hasApi, hasDatabase, authMode } = input;

  switch (module) {
    case 'authLayouts':
      return authMode !== 'none'
        ? { enabled: true }
        : {
            enabled: false,
            reason: 'Requires authentication middleware — enable JWT or OAuth in Step 3.',
          };

    case 'userManagement':
      if (!hasApi) return { enabled: false, reason: 'Requires an API layer — configure Step 3.' };
      if (!hasDatabase) {
        return { enabled: false, reason: 'Requires a database — choose one in Step 3.' };
      }
      return { enabled: true };

    case 'stripeBilling':
      if (!hasApi) {
        return {
          enabled: false,
          reason: 'Requires an API layer for the Stripe webhook endpoint — configure Step 3.',
        };
      }
      if (!hasDatabase) {
        return { enabled: false, reason: 'Requires a database to persist subscriptions.' };
      }
      return { enabled: true };

    case 'settingsRbac':
      if (authMode === 'none') {
        return {
          enabled: false,
          reason: 'Requires authentication middleware — enable it in Step 3.',
        };
      }
      if (!hasDatabase) {
        return { enabled: false, reason: 'Requires a database to store roles and permissions.' };
      }
      return { enabled: true };
  }
}
