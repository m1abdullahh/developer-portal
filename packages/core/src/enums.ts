/**
 * Every option the wizard offers, as const tuples.
 *
 * These are the single source of truth: the Zod schema builds from them, the wizard renders
 * from them, and a contract test asserts that every value here has a registered generator
 * recipe (doc 08 §5). Adding an option without a recipe fails CI immediately.
 */

export const DEPLOYMENT_TARGETS = ['aws-eks', 'cloudflare-vercel', 'onprem-k8s'] as const;
export const REPO_VISIBILITIES = ['private', 'internal'] as const;

export const UI_FRAMEWORKS = ['nextjs-app', 'vite-react', 'nuxt'] as const;
export const UI_STYLINGS = ['tailwind-shadcn', 'mui', 'css-modules'] as const;
export const UI_STATES = ['zustand', 'redux-toolkit', 'react-query', 'context'] as const;
export const UI_MODULES = [
  'authLayouts',
  'userManagement',
  'stripeBilling',
  'settingsRbac',
] as const;

export const API_RUNTIMES = ['node-ts', 'python-fastapi', 'go-gin'] as const;
export const API_PARADIGMS = ['rest', 'graphql', 'trpc'] as const;
export const DATABASES = ['postgres', 'mongodb', 'none'] as const;
export const ORMS = [
  'prisma',
  'drizzle',
  'mongoose',
  'sqlmodel',
  'sqlalchemy',
  'beanie',
  'gorm',
  'sqlc',
  'mongo-go',
  'none',
] as const;
export const AUTH_MODES = ['none', 'jwt', 'oauth'] as const;

export const CONTAINER_STRATEGIES = ['distroless', 'alpine', 'none'] as const;
export const INGRESS_CONTROLLERS = ['nginx', 'traefik', 'none'] as const;
export const SYNC_POLICIES = ['manual', 'auto', 'auto-prune'] as const;
export const REGISTRIES = ['ecr', 'dockerhub', 'ghcr'] as const;

export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[number];
export type RepoVisibility = (typeof REPO_VISIBILITIES)[number];
export type UiFramework = (typeof UI_FRAMEWORKS)[number];
export type UiStyling = (typeof UI_STYLINGS)[number];
export type UiState = (typeof UI_STATES)[number];
export type UiModule = (typeof UI_MODULES)[number];
export type ApiRuntime = (typeof API_RUNTIMES)[number];
export type ApiParadigm = (typeof API_PARADIGMS)[number];
export type Database = (typeof DATABASES)[number];
export type Orm = (typeof ORMS)[number];
export type AuthMode = (typeof AUTH_MODES)[number];
export type ContainerStrategy = (typeof CONTAINER_STRATEGIES)[number];
export type IngressController = (typeof INGRESS_CONTROLLERS)[number];
export type SyncPolicy = (typeof SYNC_POLICIES)[number];
export type Registry = (typeof REGISTRIES)[number];

/** Frameworks that render Vue rather than React. Drives the substitution tables. */
export const VUE_FRAMEWORKS: ReadonlySet<UiFramework> = new Set<UiFramework>(['nuxt']);

export function isVueFramework(framework: UiFramework): boolean {
  return VUE_FRAMEWORKS.has(framework);
}

/** Deployment targets that produce Kubernetes artefacts. */
export function targetUsesKubernetes(target: DeploymentTarget): boolean {
  return target === 'aws-eks' || target === 'onprem-k8s';
}
