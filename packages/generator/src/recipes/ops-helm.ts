/**
 * Kubernetes manifests, emitted as a Helm chart.
 *
 * A chart rather than raw YAML (documented deviation, doc 04 §2): the PRD asks for manifests
 * parameterised across environments, and raw YAML would need one full copy per environment.
 * ArgoCD consumes charts natively, and `helm template` gives CI a free validation step.
 *
 * Skipped entirely for the Cloudflare/Vercel target — those are managed platforms with no
 * Kubernetes layer, and emitting a chart nobody applies is worse than emitting nothing.
 */

import { templatePath } from '@idp/templates';
import { targetUsesKubernetes, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { deployableContract } from '../deployable-contract.js';
import { README_ORDER } from '../merge/readme.js';
import type { Recipe } from '../types.js';

export const HELM_RECIPE_ID = 'ops.k8s.helm';

export const helmRecipe: Recipe = {
  id: HELM_RECIPE_ID,
  phase: 'integration',
  // Ops artefacts stay at the repository root even in a monorepo — one chart deploys the
  // service, and root-anchored paths bypass the layer prefix.
  layer: 'ops',

  appliesTo: (spec: ProjectSpec) =>
    spec.ops.k8s.enabled && targetUsesKubernetes(spec.meta.deploymentTarget),

  // `deployable` rather than a ternary inside values.yaml: the port and probe paths belong to
  // whichever image this chart points at, and only the container recipes know them.
  files: (ctx) =>
    loadTemplateDir(templatePath('ops', 'k8s', 'helm'), ctx, HELM_RECIPE_ID, {
      deployable: deployableContract(ctx.spec),
    }),

  gitignore: () => ['deploy/charts/', 'deploy/*.tgz'],

  readme: (ctx) => ({
    order: README_ORDER.deployment,
    heading: 'Kubernetes',
    body: [
      'A Helm chart in `deploy/`, with one values file per environment.',
      '',
      '```bash',
      'helm template deploy -f deploy/values-dev.yaml --set image.tag=abc123',
      `helm upgrade --install ${ctx.spec.meta.slug} deploy -f deploy/values-prod.yaml --set image.tag=$SHA`,
      '```',
      '',
      '**Defaults worth knowing, because each prevents a specific outage:**',
      '',
      '| Setting | Why |',
      '| --- | --- |',
      '| `maxUnavailable: 0` | Capacity never dips during a deploy |',
      '| PodDisruptionBudget | A node drain cannot evict every replica at once |',
      '| NetworkPolicy default-deny | Pods cannot bypass the ingress controller |',
      '| No CPU limit, memory limit set | CPU is compressible and throttles; memory is not, it OOM-kills |',
      '| `automountServiceAccountToken: false` | The workload never calls the K8s API, so the token is only an escalation path |',
      '| `image.tag` required | `latest` makes rollbacks guesswork; CI writes the commit SHA |',
      '| HPA scale-down stabilisation 300s | Prevents the remove-pod / load-rises / add-pod oscillation |',
      '',
      `Probe paths (\`${deployableContract(ctx.spec).livenessPath}\`, ` +
        `\`${deployableContract(ctx.spec).readinessPath}\`) and the container port ` +
        `(\`${deployableContract(ctx.spec).port}\`) come from the image this chart deploys, not`,
      'from a default. Changing a route without changing the chart causes restart loops that look',
      'like application crashes.',
    ].join('\n'),
  }),
};
