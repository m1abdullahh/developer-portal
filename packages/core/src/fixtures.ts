/**
 * Canonical spec fixtures.
 *
 * Exported from the package (not confined to tests) because the generator's golden-file
 * suite, the smoke matrix and the CLI all need the same known-good starting points. One
 * definition avoids the three drifting apart.
 */

import type { ProjectSpec } from './spec.js';
import { CURRENT_SPEC_VERSION } from './spec.js';

/** Deep-merges a partial override into a spec fixture. */
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

function merge<T>(base: T, override: DeepPartial<T>): T {
  if (override === undefined) return base;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      value !== null && typeof value === 'object' && !Array.isArray(value) && current != null
        ? merge(current, value as never)
        : value;
  }
  return out as T;
}

/**
 * The P1 spine: Next.js App Router + Tailwind/shadcn + Zustand + Node/Fastify + REST +
 * Postgres/Prisma + all middleware + distroless container + K8s + ArgoCD on EKS.
 *
 * This is the combination the entire Phase 1 gate is measured against.
 */
export function spineSpec(override: DeepPartial<ProjectSpec> = {}): ProjectSpec {
  const base: ProjectSpec = {
    specVersion: CURRENT_SPEC_VERSION,
    meta: {
      projectName: 'Acme Health Backend',
      slug: 'acme-health-backend',
      clientName: 'Acme Health',
      description: 'Patient records service for Acme Health.',
      deploymentTarget: 'aws-eks',
      repo: {
        org: 'acme-internal',
        visibility: 'private',
        defaultBranch: 'main',
        teamSlugs: ['platform'],
        branchProtection: true,
      },
    },
    ui: {
      framework: 'nextjs-app',
      styling: 'tailwind-shadcn',
      state: 'zustand',
      modules: {
        authLayouts: true,
        userManagement: true,
        stripeBilling: false,
        settingsRbac: true,
      },
    },
    api: {
      runtime: 'node-ts',
      paradigm: 'rest',
      database: 'postgres',
      orm: 'prisma',
      cache: true,
      middleware: {
        auth: 'jwt',
        rateLimit: true,
        cors: true,
        validation: true,
        logging: true,
      },
    },
    ops: {
      container: { strategy: 'distroless', rootless: true, multiArch: false },
      k8s: {
        enabled: true,
        namespace: 'acme-health',
        ingress: 'nginx',
        replicas: 2,
        hpa: { enabled: true, min: 2, max: 10, cpuTargetPercent: 70 },
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
      gitops: {
        enabled: true,
        argoRepoUrl: 'https://github.com/acme-internal/gitops',
        targetCluster: 'https://kubernetes.default.svc',
        syncPolicy: 'auto',
      },
      cicd: { registry: 'ecr', lint: true, test: true, buildPush: true, argoSync: true },
    },
  };
  return merge(base, override);
}

/** Frontend-only project targeting Vercel — exercises the collapsed Step 4 path. */
export function uiOnlyVercelSpec(override: DeepPartial<ProjectSpec> = {}): ProjectSpec {
  return spineSpec(
    merge(
      {
        meta: { slug: 'acme-marketing-site', deploymentTarget: 'cloudflare-vercel' },
        ui: { modules: { authLayouts: false, userManagement: false, settingsRbac: false } },
        api: null,
        ops: {
          k8s: { enabled: false },
          gitops: { enabled: false },
          cicd: { registry: 'ghcr' },
        },
      } as DeepPartial<ProjectSpec>,
      override,
    ),
  );
}

/** API-only Go service — exercises the non-Node runtime path with no UI. */
export function apiOnlyGoSpec(override: DeepPartial<ProjectSpec> = {}): ProjectSpec {
  return spineSpec(
    merge(
      {
        meta: { slug: 'acme-ledger-api', deploymentTarget: 'onprem-k8s' },
        ui: null,
        api: { runtime: 'go-gin', paradigm: 'rest', database: 'postgres', orm: 'gorm' },
        ops: { cicd: { registry: 'ghcr' } },
      } as DeepPartial<ProjectSpec>,
      override,
    ),
  );
}
