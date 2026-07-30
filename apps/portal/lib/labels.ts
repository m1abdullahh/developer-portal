/**
 * Human-readable names for every enum value.
 *
 * Kept out of `@idp/core` on purpose: the enums are a contract shared with the generator and the
 * CLI, and presentation copy has no business travelling with it. `Record<T, ...>` means adding an
 * option to the contract fails to compile here until someone writes its label.
 */

import type {
  ApiParadigm,
  ApiRuntime,
  AuthMode,
  ContainerStrategy,
  Database,
  DeploymentTarget,
  IngressController,
  Registry,
  RepoVisibility,
  SyncPolicy,
  UiFramework,
  UiModule,
  UiState,
  UiStyling,
} from '@idp/core';

export interface OptionMeta {
  label: string;
  description: string;
  /** Options without a P1 recipe. Shown, selectable-looking, but disabled with this note. */
  comingIn?: 'P2' | 'P3';
}

export const DEPLOYMENT_TARGETS: Record<DeploymentTarget, OptionMeta> = {
  'aws-eks': {
    label: 'AWS EKS',
    description: 'Managed Kubernetes on AWS. Full Helm chart, ArgoCD and ECR pipeline.',
  },
  'cloudflare-vercel': {
    label: 'Cloudflare / Vercel',
    description: 'Managed platform. No Kubernetes or ArgoCD — the pipeline deploys directly.',
  },
  'onprem-k8s': {
    label: 'On-premise Kubernetes',
    description: 'Your own cluster. Same manifests as EKS, with GHCR as the default registry.',
  },
};

export const VISIBILITIES: Record<RepoVisibility, OptionMeta> = {
  private: { label: 'Private', description: 'Visible only to the teams you grant access to.' },
  internal: { label: 'Internal', description: 'Visible to every member of the organisation.' },
};

export const UI_FRAMEWORKS: Record<UiFramework, OptionMeta> = {
  'nextjs-app': {
    label: 'Next.js (App Router)',
    description: 'React 19, server components, file-based routing.',
  },
  'vite-react': {
    label: 'Vite + React',
    description: 'A client-rendered SPA. No server rendering; builds to static assets.',
  },
  nuxt: {
    label: 'Nuxt 4',
    description: 'Vue 3. State and styling options are substituted for their Vue equivalents.',
    comingIn: 'P2',
  },
};

export const UI_STYLINGS: Record<UiStyling, OptionMeta> = {
  'tailwind-shadcn': {
    label: 'Tailwind CSS + shadcn/ui',
    description: 'Utility CSS with a vendored, editable component set.',
  },
  mui: { label: 'MUI', description: 'Material Design components for React.', comingIn: 'P2' },
  'css-modules': {
    label: 'CSS Modules',
    description: 'Scoped plain CSS. No framework, no build plugin, no dependency.',
  },
};

export const UI_STATES: Record<UiState, OptionMeta> = {
  zustand: { label: 'Zustand', description: 'Minimal store, no provider required.' },
  'redux-toolkit': {
    label: 'Redux Toolkit',
    description: 'Structured slices with typed hooks. Store is per-request, not a singleton.',
  },
  'react-query': {
    label: 'TanStack Query',
    description: 'Server-state cache, with a small context store for client-only state.',
  },
  context: {
    label: 'React Context',
    description: 'useReducer with split state/dispatch contexts. No dependency.',
  },
};

export const UI_MODULES: Record<UiModule, OptionMeta> = {
  authLayouts: {
    label: 'Authentication layouts',
    description: 'Sign-in, sign-up and password-reset pages wired to your auth middleware.',
    comingIn: 'P3',
  },
  userManagement: {
    label: 'User management',
    description: 'User list, detail and invite flows backed by your database.',
    comingIn: 'P3',
  },
  stripeBilling: {
    label: 'Stripe billing',
    description: 'Checkout, subscription state and a webhook endpoint.',
    comingIn: 'P3',
  },
  settingsRbac: {
    label: 'Settings & RBAC',
    description: 'Org settings with role and permission management.',
    comingIn: 'P3',
  },
};

export const API_RUNTIMES: Record<ApiRuntime, OptionMeta> = {
  'node-ts': { label: 'Node.js (TypeScript)', description: 'Fastify 5 with end-to-end types.' },
  'python-fastapi': {
    label: 'Python (FastAPI)',
    description: 'FastAPI with Pydantic models.',
    comingIn: 'P3',
  },
  'go-gin': { label: 'Go (Gin)', description: 'Gin with generated OpenAPI.', comingIn: 'P3' },
};

export const API_PARADIGMS: Record<ApiParadigm, OptionMeta> = {
  rest: { label: 'REST + OpenAPI', description: 'Zod schemas generate the OpenAPI document.' },
  graphql: {
    label: 'GraphQL',
    description: 'Schema-first with a typed resolver map.',
    comingIn: 'P2',
  },
  trpc: {
    label: 'tRPC',
    description: 'End-to-end inference with no schema step. Node only.',
    comingIn: 'P2',
  },
};

export const DATABASES: Record<Database, OptionMeta> = {
  postgres: { label: 'PostgreSQL', description: 'Relational, with migrations.' },
  mongodb: { label: 'MongoDB', description: 'Document store.', comingIn: 'P2' },
  none: { label: 'None', description: 'A stateless service.' },
};

export const AUTH_MODES: Record<AuthMode, OptionMeta> = {
  none: { label: 'None', description: 'Open endpoints. Suitable for internal-only services.' },
  jwt: { label: 'JWT', description: 'Bearer tokens verified on every request.' },
  oauth: { label: 'OAuth 2.0', description: 'Delegated identity via a provider.', comingIn: 'P2' },
};

export const CONTAINER_STRATEGIES: Record<ContainerStrategy, OptionMeta> = {
  distroless: {
    label: 'Distroless',
    description: 'No shell, no package manager — the smallest attack surface.',
  },
  alpine: { label: 'Alpine', description: 'Small, with a shell for debugging.' },
  none: { label: 'None', description: 'No container image is produced.' },
};

export const INGRESS_CONTROLLERS: Record<IngressController, OptionMeta> = {
  nginx: { label: 'NGINX', description: 'The most widely deployed ingress controller.' },
  traefik: { label: 'Traefik', description: 'Dynamic configuration, native CRDs.' },
  none: { label: 'None', description: 'No ingress — cluster-internal only.' },
};

export const SYNC_POLICIES: Record<SyncPolicy, OptionMeta> = {
  manual: { label: 'Manual', description: 'ArgoCD waits for you to press sync.' },
  auto: { label: 'Automatic', description: 'Applies changes as they land in git.' },
  'auto-prune': {
    label: 'Automatic + prune',
    description: 'Also deletes resources removed from git.',
  },
};

export const REGISTRIES: Record<Registry, OptionMeta> = {
  ecr: { label: 'Amazon ECR', description: 'Authenticated via OIDC, no static keys.' },
  dockerhub: { label: 'Docker Hub', description: 'Requires a stored access token.' },
  ghcr: { label: 'GitHub Container Registry', description: 'Uses the workflow token.' },
};

/** The note shown on an option that exists in the contract but has no recipe yet. */
export function comingSoonReason(meta: OptionMeta): string | undefined {
  return meta.comingIn
    ? `Arrives in ${meta.comingIn}. The option is part of the contract but has no generator recipe yet.`
    : undefined;
}
