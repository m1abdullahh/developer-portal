/**
 * GitOps and CI/CD recipes.
 *
 * The ArgoCD manifests and the GitHub Actions workflows are separate recipes because they are
 * independently selectable: a Cloudflare/Vercel project has CI/CD but no ArgoCD, and a team
 * may run the chart manually without GitOps.
 *
 * Both are `layer: 'ops'`, so their paths stay at the repository root even in a monorepo —
 * `.github/workflows/` under apps/web/ is a directory GitHub Actions never reads.
 */

import { templatePath } from '@idp/templates';
import { targetUsesKubernetes, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import type { Recipe } from '../types.js';

export const ARGOCD_RECIPE_ID = 'ops.gitops.argocd';

export const argocdRecipe: Recipe = {
  id: ARGOCD_RECIPE_ID,
  phase: 'integration',
  layer: 'ops',

  appliesTo: (spec: ProjectSpec) =>
    spec.ops.gitops.enabled &&
    spec.ops.k8s.enabled &&
    targetUsesKubernetes(spec.meta.deploymentTarget),

  files: (ctx) => loadTemplateDir(templatePath('ops', 'gitops', 'argocd'), ctx, ARGOCD_RECIPE_ID),

  readme: (ctx) => ({
    order: README_ORDER.deployment,
    heading: 'GitOps (ArgoCD)',
    body: [
      'Application manifests in `gitops/`, one per environment, plus an AppProject scoping what',
      'they may deploy.',
      '',
      '```bash',
      'kubectl apply -f gitops/project.yaml',
      'kubectl apply -f gitops/application-dev.yaml',
      '```',
      '',
      '**Production sync is manual by default.** Automated sync means a merge to the default',
      'branch reaches live traffic with no human in between. Promote explicitly:',
      '',
      '```bash',
      `argocd app sync ${ctx.spec.meta.slug}-prod`,
      '```',
      '',
      'Two settings worth knowing:',
      '',
      '- `ignoreDifferences` on `/spec/replicas` — without it Argo resets the autoscaled replica',
      '  count, the HPA scales it back, and the Application sits permanently OutOfSync.',
      '- The AppProject allowlists source repos and blocks `Secret` creation. `sourceRepos: ["*"]`',
      '  would turn Application-create permission into effective cluster-admin.',
    ].join('\n'),
  }),
};

export const GITHUB_ACTIONS_RECIPE_ID = 'ops.cicd.github-actions';

export const githubActionsRecipe: Recipe = {
  id: GITHUB_ACTIONS_RECIPE_ID,
  phase: 'integration',
  layer: 'ops',

  appliesTo: (spec: ProjectSpec) =>
    spec.ops.cicd.lint || spec.ops.cicd.test || spec.ops.cicd.buildPush,

  files: (ctx) =>
    loadTemplateDir(templatePath('ops', 'cicd', 'github-actions'), ctx, GITHUB_ACTIONS_RECIPE_ID),

  readme: (ctx) => ({
    order: README_ORDER.deployment,
    heading: 'CI/CD',
    body: [
      '| Workflow | Trigger | Does |',
      '| --- | --- | --- |',
      '| `ci.yml` | PR and push | lint, typecheck, test, build; hadolint; `helm template` + kubeconform; image build **without** push |',
      '| `cd.yml` | push to default branch | build and push image tagged with the commit SHA, then update the chart tag and commit |',
      '',
      'CI validates the container and the manifests, not just the code — a chart that renders',
      'invalid YAML is otherwise only discovered by ArgoCD at deploy time.',
      '',
      '**`cd.yml` never runs `kubectl apply` or `argocd app sync`.** It commits the new image tag',
      'and ArgoCD reconciles from the repository. A pipeline that applies directly makes the',
      'cluster diverge from git, which is the exact drift GitOps exists to remove.',
      '',
      ...(ctx.spec.ops.cicd.registry === 'ecr'
        ? [
            'ECR authentication uses OIDC role assumption — set `AWS_ROLE_ARN` and `AWS_REGION`.',
            'No static AWS keys, which are the most common leak vector in this pipeline shape.',
          ]
        : ctx.spec.ops.cicd.registry === 'ghcr'
          ? ['GHCR authentication uses the built-in `GITHUB_TOKEN`; no secret to configure.']
          : ['Set `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` in repository secrets.']),
      '',
      'Set the `IMAGE_REPO_WEB` / `IMAGE_REPO_API` repository *variables* to your image paths.',
    ].join('\n'),
  }),
};
