/**
 * What the image a chart deploys promises about itself.
 *
 * The Helm chart is generic — one Deployment, one Service, one set of probes — but the image it
 * points at is not. A Fastify container listens on 3001 and answers `/health` and `/ready`; a Next
 * container listens on 3000 and answers `/api/health`; the nginx SPA image listens on 8080, answers
 * `/healthz`, and runs as UID 101 rather than distroless's 65532.
 *
 * Until now `values.yaml` guessed with a ternary on `spec.ui && spec.api`, which was right for the
 * full-stack case and wrong for both others. The failure is invisible to every check we run: the
 * chart renders, the schema validates, `kubectl apply` succeeds — and then the probes hit paths
 * nobody serves on a port nobody is listening to, so the pod never becomes Ready and the rollout
 * hangs. Nothing short of a real cluster says why.
 *
 * So each container recipe states these four facts about the image it builds, and the chart asks.
 * Same shape as the framework contract, for the same reason: the knowledge belongs beside the
 * thing that has it.
 *
 * ── Which deployable? ────────────────────────────────────────────────────────
 * A UI+API project builds two images but the chart deploys one. It deploys the API — the browser
 * app in that topology goes to a CDN or its own chart, and this preserves the behaviour the
 * ternary already had. `deployableContract` encodes that choice in one place instead of leaving it
 * implicit in a template expression.
 */

import type { ProjectSpec } from '@idp/core';

export interface DeployableContract {
  /** The container recipe's id — recorded so a mismatched registration is traceable. */
  recipeId: string;
  /** Port the process inside the image listens on. Drives containerPort, Service and NetworkPolicy. */
  port: number;
  /**
   * Path the liveness probe hits. Failing it restarts the container, so it must answer from the
   * process itself and must not depend on anything downstream.
   */
  livenessPath: string;
  /**
   * Path the readiness probe hits. Failing it removes the pod from the Service without killing it.
   *
   * Equal to `livenessPath` where the distinction is not real: a static file server either answers
   * or it does not, and inventing a second endpoint that returns the same 200 would be ceremony.
   * Where a dependency exists — the Fastify image checks its database — the paths differ and the
   * difference matters.
   */
  readinessPath: string;
  /**
   * Numeric UID the image runs as.
   *
   * Numeric because Kubernetes cannot verify `runAsNonRoot` against a username — it has no way to
   * resolve one inside the image. 65532 is distroless's `nonroot`; the unprivileged nginx image
   * uses 101.
   */
  runAsUser: number;
  /**
   * Paths needing an emptyDir because the root filesystem is read-only.
   *
   * `/tmp` covers most images. nginx also writes its proxy and client-body buffers under
   * `/var/cache/nginx`, and without that mount it degrades under load in a way that never appears
   * in a smoke test — the small responses a health check makes are buffered in memory.
   */
  writablePaths: readonly string[];
}

const contracts = new Map<string, DeployableContract>();

/** Keyed by container recipe id, registered by that recipe at module load. */
export function registerDeployableContract(contract: DeployableContract): void {
  contracts.set(contract.recipeId, contract);
}

export class UnknownDeployableError extends Error {
  constructor(recipeId: string) {
    super(
      `No deployable contract is registered for "${recipeId}". A container recipe must call ` +
        `registerDeployableContract() at module load, or the Helm chart cannot know which port ` +
        `to route to or which paths to probe.`,
    );
    this.name = 'UnknownDeployableError';
  }
}

/**
 * The container recipe id whose image this spec's chart deploys.
 *
 * Exported so the container recipes can name their own ids without importing each other, and so
 * the test suite can assert the selection rule directly rather than through rendered YAML.
 */
export function deployableRecipeId(spec: ProjectSpec): string {
  if (spec.api) return 'ops.container.node-api';
  if (spec.ui?.framework === 'vite-react') return 'ops.container.spa-nginx';
  if (spec.ui?.framework === 'nextjs-app') return 'ops.container.next';
  if (spec.ui?.framework === 'nuxt') return 'ops.container.nuxt';

  throw new Error(
    `No deployable could be determined for "${spec.meta.slug}": it has no API layer and its UI ` +
      `framework (${spec.ui?.framework ?? 'none'}) has no container recipe. A chart deploying ` +
      `nothing is worse than no chart — guard on this before enabling ops.k8s.`,
  );
}

export function deployableContract(spec: ProjectSpec): DeployableContract {
  const recipeId = deployableRecipeId(spec);
  const contract = contracts.get(recipeId);
  if (!contract) throw new UnknownDeployableError(recipeId);
  return contract;
}

/** Test affordance: the container recipes that have registered a contract. */
export function registeredDeployables(): string[] {
  return [...contracts.keys()].sort();
}
