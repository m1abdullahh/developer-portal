/**
 * ProjectSpec — the single contract flowing through the entire system.
 *
 * The wizard produces it, the queue transports it, the generator consumes it, the catalog
 * stores it. Defined exactly once, here. See docs/plan/00-architecture.md §3.
 */

import { z } from 'zod';
import {
  API_PARADIGMS,
  API_RUNTIMES,
  AUTH_MODES,
  CONTAINER_STRATEGIES,
  DATABASES,
  DEPLOYMENT_TARGETS,
  INGRESS_CONTROLLERS,
  ORMS,
  REGISTRIES,
  REPO_VISIBILITIES,
  SYNC_POLICIES,
  UI_FRAMEWORKS,
  UI_STATES,
  UI_STYLINGS,
  targetUsesKubernetes,
} from './enums.js';
import { availableOrms, availableParadigms, moduleGate } from './compatibility.js';
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, validateSlug } from './slug.js';

/**
 * Bumped whenever the schema changes shape. The catalog reads specs written months earlier,
 * so a migration function per version is far cheaper than a data backfill.
 */
export const CURRENT_SPEC_VERSION = 1;

// ── Step 1 ───────────────────────────────────────────────────────────────────

export const repoConfigSchema = z.object({
  org: z.string().min(1, 'Select a GitHub organization.'),
  visibility: z.enum(REPO_VISIBILITIES).default('private'),
  defaultBranch: z.string().min(1).default('main'),
  teamSlugs: z.array(z.string()).default([]),
  branchProtection: z.boolean().default(true),
});

export const metaSchema = z.object({
  projectName: z.string().min(3, 'At least 3 characters.').max(64),
  // superRefine rather than refine: Zod 4 removed function-returning message params, and we
  // need validateSlug's specific reason ("reserved", "consecutive hyphens", …) not a generic one.
  slug: z
    .string()
    .min(SLUG_MIN_LENGTH)
    .max(SLUG_MAX_LENGTH)
    .superRefine((s, ctx) => {
      const result = validateSlug(s);
      if (!result.valid) {
        ctx.addIssue({ code: 'custom', message: result.message ?? 'Invalid technical ID.' });
      }
    }),
  clientName: z.string().min(2, 'At least 2 characters.').max(64),
  description: z.string().max(280).optional(),
  deploymentTarget: z.enum(DEPLOYMENT_TARGETS),
  repo: repoConfigSchema,
});

// ── Step 2 ───────────────────────────────────────────────────────────────────

export const uiModulesSchema = z.object({
  authLayouts: z.boolean().default(false),
  userManagement: z.boolean().default(false),
  stripeBilling: z.boolean().default(false),
  settingsRbac: z.boolean().default(false),
});

export const uiSchema = z.object({
  framework: z.enum(UI_FRAMEWORKS),
  styling: z.enum(UI_STYLINGS),
  state: z.enum(UI_STATES),
  modules: uiModulesSchema,
});

// ── Step 3 ───────────────────────────────────────────────────────────────────

export const middlewareSchema = z.object({
  auth: z.enum(AUTH_MODES).default('jwt'),
  rateLimit: z.boolean().default(true),
  cors: z.boolean().default(true),
  validation: z.boolean().default(true),
  logging: z.boolean().default(true),
});

export const apiSchema = z.object({
  runtime: z.enum(API_RUNTIMES),
  paradigm: z.enum(API_PARADIGMS),
  database: z.enum(DATABASES),
  orm: z.enum(ORMS),
  cache: z.boolean().default(false),
  middleware: middlewareSchema,
});

// ── Step 4 ───────────────────────────────────────────────────────────────────

export const resourceQuantitiesSchema = z.object({
  cpu: z.string().min(1),
  memory: z.string().min(1),
});

export const opsSchema = z.object({
  container: z.object({
    strategy: z.enum(CONTAINER_STRATEGIES).default('distroless'),
    rootless: z.boolean().default(true),
    multiArch: z.boolean().default(false),
  }),
  k8s: z.object({
    enabled: z.boolean(),
    namespace: z.string().default('default'),
    ingress: z.enum(INGRESS_CONTROLLERS).default('nginx'),
    replicas: z.number().int().min(1).max(10).default(2),
    hpa: z.object({
      enabled: z.boolean().default(true),
      min: z.number().int().min(1).default(2),
      max: z.number().int().min(1).default(10),
      cpuTargetPercent: z.number().int().min(1).max(100).default(70),
    }),
    resources: z.object({
      requests: resourceQuantitiesSchema,
      limits: resourceQuantitiesSchema,
    }),
  }),
  gitops: z.object({
    enabled: z.boolean(),
    argoRepoUrl: z.string().optional(),
    targetCluster: z.string().optional(),
    syncPolicy: z.enum(SYNC_POLICIES).default('auto'),
  }),
  cicd: z.object({
    registry: z.enum(REGISTRIES),
    lint: z.boolean().default(true),
    test: z.boolean().default(true),
    buildPush: z.boolean().default(true),
    argoSync: z.boolean().default(true),
  }),
});

// ── Whole spec ───────────────────────────────────────────────────────────────

const baseProjectSpecSchema = z.object({
  specVersion: z.literal(CURRENT_SPEC_VERSION),
  meta: metaSchema,
  /** null ⇒ API-only project */
  ui: uiSchema.nullable(),
  /** null ⇒ frontend-only project */
  api: apiSchema.nullable(),
  ops: opsSchema,
});

/**
 * Cross-field rules. Everything here is a contradiction the wizard already prevents —
 * this layer exists because the wizard is convenience and the schema is truth. A crafted
 * request that skips the UI must still be rejected.
 */
export const projectSpecSchema = baseProjectSpecSchema.superRefine((spec, ctx) => {
  // A project with neither a UI nor an API has nothing to generate.
  if (!spec.ui && !spec.api) {
    ctx.addIssue({
      code: 'custom',
      path: ['ui'],
      message: 'A project must include a UI layer, an API layer, or both.',
    });
  }

  if (spec.api) {
    // Contradiction 3 — tRPC is Node-only.
    if (!availableParadigms(spec.api.runtime).includes(spec.api.paradigm)) {
      ctx.addIssue({
        code: 'custom',
        path: ['api', 'paradigm'],
        message:
          spec.api.paradigm === 'trpc'
            ? 'tRPC requires the Node.js (TypeScript) runtime.'
            : `${spec.api.paradigm} is not available for the ${spec.api.runtime} runtime.`,
      });
    }

    // Contradiction 4 — ORM must match runtime and database.
    if (!availableOrms(spec.api.runtime, spec.api.database).includes(spec.api.orm)) {
      ctx.addIssue({
        code: 'custom',
        path: ['api', 'orm'],
        message: `The selected ORM is not available for ${spec.api.runtime} with ${spec.api.database}.`,
      });
    }

    if (spec.api.database === 'none' && spec.api.orm !== 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['api', 'orm'],
        message: 'An ORM cannot be selected without a database.',
      });
    }
  }

  // Page-module dependencies.
  if (spec.ui) {
    const gateInput = {
      hasApi: spec.api !== null,
      hasDatabase: spec.api !== null && spec.api.database !== 'none',
      authMode: spec.api?.middleware.auth ?? ('none' as const),
    };
    for (const [name, enabled] of Object.entries(spec.ui.modules)) {
      if (!enabled) continue;
      const gate = moduleGate(name as keyof typeof spec.ui.modules, gateInput);
      if (!gate.enabled) {
        ctx.addIssue({
          code: 'custom',
          path: ['ui', 'modules', name],
          message: gate.reason ?? `The ${name} module's requirements are not met.`,
        });
      }
    }
  }

  // Contradiction 5 — deployment target reshapes Step 4.
  const usesK8s = targetUsesKubernetes(spec.meta.deploymentTarget);
  if (!usesK8s && spec.ops.k8s.enabled) {
    ctx.addIssue({
      code: 'custom',
      path: ['ops', 'k8s', 'enabled'],
      message: 'Kubernetes manifests do not apply to the Cloudflare / Vercel deployment target.',
    });
  }
  if (!usesK8s && spec.ops.gitops.enabled) {
    ctx.addIssue({
      code: 'custom',
      path: ['ops', 'gitops', 'enabled'],
      message: 'ArgoCD GitOps does not apply to the Cloudflare / Vercel deployment target.',
    });
  }

  // GitOps without Kubernetes is meaningless — ArgoCD syncs K8s manifests.
  if (spec.ops.gitops.enabled && !spec.ops.k8s.enabled) {
    ctx.addIssue({
      code: 'custom',
      path: ['ops', 'gitops', 'enabled'],
      message: 'ArgoCD requires Kubernetes manifests to be enabled.',
    });
  }

  // HPA bounds must be coherent, and must not contradict the fixed replica count.
  if (spec.ops.k8s.hpa.enabled && spec.ops.k8s.hpa.max < spec.ops.k8s.hpa.min) {
    ctx.addIssue({
      code: 'custom',
      path: ['ops', 'k8s', 'hpa', 'max'],
      message: 'Maximum replicas must be greater than or equal to the minimum.',
    });
  }

  // A container is required to produce an image to deploy.
  if (spec.ops.k8s.enabled && spec.ops.container.strategy === 'none') {
    ctx.addIssue({
      code: 'custom',
      path: ['ops', 'container', 'strategy'],
      message: 'Kubernetes deployment requires a container image.',
    });
  }
});

export type ProjectSpec = z.infer<typeof projectSpecSchema>;
export type ProjectMeta = z.infer<typeof metaSchema>;
export type UiSpec = z.infer<typeof uiSchema>;
export type ApiSpec = z.infer<typeof apiSchema>;
export type OpsSpec = z.infer<typeof opsSchema>;
export type MiddlewareSpec = z.infer<typeof middlewareSchema>;

/** Parses and validates, throwing on failure. Use at trust boundaries. */
export function parseProjectSpec(input: unknown): ProjectSpec {
  return projectSpecSchema.parse(input);
}

/** Non-throwing variant for form validation paths. */
export function safeParseProjectSpec(input: unknown) {
  return projectSpecSchema.safeParse(input);
}
