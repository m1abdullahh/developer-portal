/**
 * The chart must agree with the image it deploys.
 *
 * This is the unit-test half of `scripts/ops-lint.mjs`. That harness needs helm, kubeconform,
 * hadolint and conftest — none of which are npm packages, so on most machines it skips. These
 * assertions need nothing but the generator, so the class of bug they guard runs on every commit.
 *
 * That class is worth naming, because it defeated every check we had before it. Three mismatches
 * were live when this file was written:
 *
 *   • The Vite SPA chart routed to port 3000. The nginx image listens on 8080.
 *   • The Next chart probed `/health`. Next serves that route at `/api/health`.
 *   • The SPA pod declared `runAsUser: 65532`. That image runs as 101.
 *
 * Each renders, validates against the Kubernetes schema and applies to a cluster without error.
 * The pod then never becomes Ready and the rollout hangs, and nothing in the output says why.
 * A ternary in `values.yaml` produced all three, which is why the answer now lives in a contract
 * the container recipes declare and this file cross-checks against what they actually generate.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec, uiOnlyVercelSpec, type ProjectSpec } from '@idp/core';
import { parse, parseAllDocuments } from 'yaml';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import {
  deployableContract,
  deployableRecipeId,
  registeredDeployables,
  type DeployableContract,
} from './deployable-contract.js';
import type { VirtualFile } from './types.js';

const registry = createRegistry();

/** The three deployables, each with the spec that selects it and the evidence it serves its own probes. */
const CASES = [
  {
    name: 'node-api',
    recipeId: 'ops.container.node-api',
    spec: spineSpec(),
    dockerfile: 'apps/api/Dockerfile',
    /** Where the probe paths must appear for the claim to be true. */
    serves: 'apps/api/src/routes/health.ts',
  },
  {
    name: 'next',
    recipeId: 'ops.container.next',
    spec: uiOnlyVercelSpec({
      meta: { slug: 'deployable-next', deploymentTarget: 'aws-eks' },
      ops: { k8s: { enabled: true } },
    }),
    dockerfile: 'Dockerfile',
    // The route file's location *is* the path under the App Router, so its existence is the claim.
    serves: 'app/api/health/route.ts',
  },
  {
    name: 'spa-nginx',
    recipeId: 'ops.container.spa-nginx',
    spec: uiOnlyVercelSpec({
      ui: { framework: 'vite-react' },
      meta: { slug: 'deployable-spa', deploymentTarget: 'aws-eks' },
      ops: { k8s: { enabled: true } },
    }),
    dockerfile: 'Dockerfile',
    serves: 'nginx.conf',
  },
] as const;

/** Memoised — six assertions per case, and a full pipeline run each time would be wasteful. */
const cache = new Map<ProjectSpec, Promise<readonly VirtualFile[]>>();

function generate(spec: ProjectSpec): Promise<readonly VirtualFile[]> {
  const hit = cache.get(spec);
  if (hit) return hit;

  const run = runPipeline(spec, { registry }).then((result) => result.files);
  cache.set(spec, run);
  return run;
}

const read = (files: readonly VirtualFile[], path: string): string => {
  const file = files.find((f) => f.path === path);
  if (!file) {
    throw new Error(`${path} was not generated. Present: ${files.map((f) => f.path).join(', ')}`);
  }
  return String(file.content);
};

describe('the registry is complete', () => {
  it('every container recipe has registered a contract', () => {
    expect(registeredDeployables()).toEqual([
      'ops.container.next',
      'ops.container.node-api',
      'ops.container.nuxt',
      'ops.container.spa-nginx',
    ]);
  });

  it.each(CASES)('$name is selected by its own spec', ({ spec, recipeId }) => {
    expect(deployableRecipeId(spec)).toBe(recipeId);
  });

  // A full-stack project builds two images and deploys one. Asserted directly rather than
  // inferred from rendered YAML, because it is a decision and not an implementation detail.
  it('a UI+API project deploys the API, not the browser app', () => {
    expect(deployableRecipeId(spineSpec())).toBe('ops.container.node-api');
  });

  it('refuses to guess when no container recipe can build the spec', () => {
    // A spec with neither an API nor a framework we can containerise. The chart would have
    // nothing to point at, and a default port here would be a fabrication.
    const impossible = { ...spineSpec(), api: null, ui: null } as unknown as ProjectSpec;
    expect(() => deployableRecipeId(impossible)).toThrow(/No deployable could be determined/);
  });
});

describe.each(CASES)('$name', ({ spec, dockerfile, serves }) => {
  const contract = (): DeployableContract => deployableContract(spec);

  it('the Dockerfile exposes the port the contract claims', async () => {
    const files = await generate(spec);
    expect(read(files, dockerfile)).toMatch(new RegExp(`^EXPOSE\\s+${contract().port}$`, 'm'));
  });

  it('values.yaml routes to that same port', async () => {
    const files = await generate(spec);
    const values = parse(read(files, 'deploy/values.yaml')) as {
      service: { targetPort: number };
      probes: { liveness: { path: string }; readiness: { path: string } };
    };

    expect(values.service.targetPort).toBe(contract().port);
    expect(values.probes.liveness.path).toBe(contract().livenessPath);
    expect(values.probes.readiness.path).toBe(contract().readinessPath);
  });

  it('the image actually serves the paths the probes hit', async () => {
    const files = await generate(spec);
    const evidence = read(files, serves);

    for (const path of [contract().livenessPath, contract().readinessPath]) {
      // For Next the file's own location is the route, so its presence is the proof and `read`
      // above has already thrown if it is missing.
      if (serves.startsWith('app/api/')) continue;

      // The last segment, because nginx writes `location = /healthz` and Fastify writes
      // `app.get('/health')` — the prefix differs, the path does not.
      expect(evidence, `${serves} never mentions ${path}`).toContain(path);
    }
  });

  it('the pod runs as the UID the image was built for', async () => {
    const files = await generate(spec);
    expect(read(files, 'deploy/templates/deployment.yaml')).toContain(
      `runAsUser: ${contract().runAsUser}`,
    );
  });

  it('every path the image writes to is mounted', async () => {
    const files = await generate(spec);
    const deployment = read(files, 'deploy/templates/deployment.yaml');

    for (const path of contract().writablePaths) {
      // readOnlyRootFilesystem is on, so an unmounted path is not a warning at deploy time —
      // it is a write that fails at some later moment under load.
      expect(deployment, `${path} has no emptyDir`).toContain(`mountPath: ${path}`);
    }
  });
});

describe('the nginx image, whose every value differs from distroless', () => {
  // Called out separately because it is the case the old ternary got wrong in four ways at once,
  // and because "the second framework works too" is the whole claim of P2.
  const spa = CASES[2].spec;

  it('listens on 8080 in nginx.conf, the Dockerfile and the chart alike', async () => {
    const files = await generate(spa);

    expect(read(files, 'nginx.conf')).toContain('listen 8080;');
    expect(read(files, 'Dockerfile')).toContain('EXPOSE 8080');
    expect(parse(read(files, 'deploy/values.yaml')).service.targetPort).toBe(8080);
  });

  it('mounts the nginx cache directory the Node images do not need', async () => {
    const files = await generate(spa);
    const docs = parseAllDocuments(read(files, 'deploy/templates/deployment.yaml'));

    // Asserted on raw text rather than parsed YAML: the file is a Helm template, so `{{ }}`
    // expressions make it invalid YAML until rendered.
    expect(docs).toBeDefined();
    expect(read(files, 'deploy/templates/deployment.yaml')).toContain(
      'mountPath: /var/cache/nginx',
    );
  });

  it('does not carry the API deployable’s probe paths', async () => {
    const files = await generate(spa);
    const values = read(files, 'deploy/values.yaml');

    // The specific symptom of the bug: an nginx pod probing routes only Fastify serves.
    expect(values).not.toContain('path: /ready');
    expect(values).toContain('path: /healthz');
  });
});
