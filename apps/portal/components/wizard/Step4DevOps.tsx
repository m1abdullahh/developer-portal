'use client';

import {
  CONTAINER_STRATEGIES as STRATEGIES,
  INGRESS_CONTROLLERS as INGRESSES,
  REGISTRIES as REGISTRY_VALUES,
  SYNC_POLICIES as POLICIES,
  step4Sections,
} from '@idp/core';
import { useWizard, validateStep } from '../../lib/wizard-store';
import {
  CONTAINER_STRATEGIES,
  INGRESS_CONTROLLERS,
  REGISTRIES,
  SYNC_POLICIES,
} from '../../lib/labels';
import { Banner, Field, Input, OptionCard, Section, Toggle } from '../ui';

/**
 * Step 4 — containers, Kubernetes, GitOps and CI/CD.
 *
 * The shape of this step is decided by the deployment target chosen in Step 1 (contradiction 5).
 * Cloudflare/Vercel is a managed platform with no cluster, so the Kubernetes and ArgoCD sections
 * are not rendered at all — showing disabled Kubernetes settings for a platform that has none
 * would be misleading rather than informative.
 */
export function Step4DevOps() {
  const state = useWizard();
  const { meta, ops, setOps } = state;
  const sections = step4Sections(meta.deploymentTarget);
  const errors = validateStep(state, 4).errors;

  return (
    <div className="space-y-8">
      {sections.banner ? <Banner>{sections.banner}</Banner> : null}

      <Section title="Container image">
        <div className="grid gap-3 sm:grid-cols-3">
          {STRATEGIES.map((strategy) => (
            <OptionCard
              key={strategy}
              title={CONTAINER_STRATEGIES[strategy].label}
              description={CONTAINER_STRATEGIES[strategy].description}
              selected={ops.container.strategy === strategy}
              onSelect={() => setOps({ container: { strategy } })}
            />
          ))}
        </div>
        {errors['ops.container.strategy'] ? (
          <Banner tone="danger">{errors['ops.container.strategy']}</Banner>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Run as a non-root user"
            description="Required by most cluster admission policies."
            checked={ops.container.rootless}
            onChange={(rootless) => setOps({ container: { rootless } })}
          />
          <Toggle
            label="Multi-architecture build"
            description="amd64 and arm64. Roughly doubles build time."
            checked={ops.container.multiArch}
            onChange={(multiArch) => setOps({ container: { multiArch } })}
          />
        </div>
      </Section>

      {sections.kubernetes ? (
        <Section title="Kubernetes">
          <Toggle
            label="Generate Kubernetes manifests"
            description="A Helm chart with deployment, service, ingress, HPA, PDB and network policy."
            checked={ops.k8s.enabled}
            onChange={(enabled) => setOps({ k8s: { enabled } })}
          />

          {ops.k8s.enabled ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Namespace" htmlFor="namespace">
                  <Input
                    id="namespace"
                    value={ops.k8s.namespace}
                    onChange={(e) => setOps({ k8s: { namespace: e.target.value } })}
                  />
                </Field>
                <Field label="Replicas" htmlFor="replicas" error={errors['ops.k8s.replicas']}>
                  <Input
                    id="replicas"
                    type="number"
                    min={1}
                    max={10}
                    value={ops.k8s.replicas}
                    onChange={(e) => setOps({ k8s: { replicas: Number(e.target.value) } })}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {INGRESSES.map((ingress) => (
                  <OptionCard
                    key={ingress}
                    title={INGRESS_CONTROLLERS[ingress].label}
                    description={INGRESS_CONTROLLERS[ingress].description}
                    selected={ops.k8s.ingress === ingress}
                    onSelect={() => setOps({ k8s: { ingress } })}
                  />
                ))}
              </div>

              <Toggle
                label="Horizontal Pod Autoscaler"
                description="Scales on CPU. The fixed replica count becomes the starting point."
                checked={ops.k8s.hpa.enabled}
                onChange={(enabled) => setOps({ k8s: { hpa: { enabled } } })}
              />

              {ops.k8s.hpa.enabled ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Minimum replicas"
                    htmlFor="hpaMin"
                    error={errors['ops.k8s.hpa.min']}
                  >
                    <Input
                      id="hpaMin"
                      type="number"
                      min={1}
                      value={ops.k8s.hpa.min}
                      onChange={(e) => setOps({ k8s: { hpa: { min: Number(e.target.value) } } })}
                    />
                  </Field>
                  <Field
                    label="Maximum replicas"
                    htmlFor="hpaMax"
                    error={errors['ops.k8s.hpa.max']}
                  >
                    <Input
                      id="hpaMax"
                      type="number"
                      min={1}
                      value={ops.k8s.hpa.max}
                      onChange={(e) => setOps({ k8s: { hpa: { max: Number(e.target.value) } } })}
                    />
                  </Field>
                  <Field label="Target CPU %" htmlFor="hpaCpu">
                    <Input
                      id="hpaCpu"
                      type="number"
                      min={1}
                      max={100}
                      value={ops.k8s.hpa.cpuTargetPercent}
                      onChange={(e) =>
                        setOps({ k8s: { hpa: { cpuTargetPercent: Number(e.target.value) } } })
                      }
                    />
                  </Field>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="CPU request" htmlFor="cpuReq">
                  <Input
                    id="cpuReq"
                    value={ops.k8s.resources.requests.cpu}
                    onChange={(e) =>
                      setOps({ k8s: { resources: { requests: { cpu: e.target.value } } } })
                    }
                  />
                </Field>
                <Field label="Memory request" htmlFor="memReq">
                  <Input
                    id="memReq"
                    value={ops.k8s.resources.requests.memory}
                    onChange={(e) =>
                      setOps({ k8s: { resources: { requests: { memory: e.target.value } } } })
                    }
                  />
                </Field>
                <Field label="CPU limit" htmlFor="cpuLim">
                  <Input
                    id="cpuLim"
                    value={ops.k8s.resources.limits.cpu}
                    onChange={(e) =>
                      setOps({ k8s: { resources: { limits: { cpu: e.target.value } } } })
                    }
                  />
                </Field>
                <Field label="Memory limit" htmlFor="memLim">
                  <Input
                    id="memLim"
                    value={ops.k8s.resources.limits.memory}
                    onChange={(e) =>
                      setOps({ k8s: { resources: { limits: { memory: e.target.value } } } })
                    }
                  />
                </Field>
              </div>
            </>
          ) : null}
        </Section>
      ) : null}

      {sections.gitops ? (
        <Section
          title="GitOps"
          description="ArgoCD syncs the cluster from git. CI commits the image tag; it never applies manifests directly."
        >
          <Toggle
            label="Generate ArgoCD manifests"
            description="An Application and AppProject pointing at this repository."
            checked={ops.gitops.enabled}
            disabled={!ops.k8s.enabled}
            disabledReason="ArgoCD syncs Kubernetes manifests — enable Kubernetes first."
            onChange={(enabled) => setOps({ gitops: { enabled } })}
          />

          {ops.gitops.enabled ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ArgoCD repository URL" htmlFor="argoRepo" hint="Optional.">
                  <Input
                    id="argoRepo"
                    value={ops.gitops.argoRepoUrl ?? ''}
                    placeholder="https://github.com/acme-internal/gitops"
                    onChange={(e) =>
                      setOps({ gitops: { argoRepoUrl: e.target.value || undefined } })
                    }
                  />
                </Field>
                <Field label="Target cluster" htmlFor="cluster" hint="Optional.">
                  <Input
                    id="cluster"
                    value={ops.gitops.targetCluster ?? ''}
                    placeholder="in-cluster"
                    onChange={(e) =>
                      setOps({ gitops: { targetCluster: e.target.value || undefined } })
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {POLICIES.map((policy) => (
                  <OptionCard
                    key={policy}
                    title={SYNC_POLICIES[policy].label}
                    description={SYNC_POLICIES[policy].description}
                    selected={ops.gitops.syncPolicy === policy}
                    onSelect={() => setOps({ gitops: { syncPolicy: policy } })}
                  />
                ))}
              </div>
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="CI/CD">
        <div className="grid gap-3 sm:grid-cols-3">
          {REGISTRY_VALUES.map((registry) => (
            <OptionCard
              key={registry}
              title={REGISTRIES[registry].label}
              description={REGISTRIES[registry].description}
              selected={ops.cicd.registry === registry}
              onSelect={() => setOps({ cicd: { registry } })}
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Lint"
            checked={ops.cicd.lint}
            onChange={(lint) => setOps({ cicd: { lint } })}
          />
          <Toggle
            label="Test"
            checked={ops.cicd.test}
            onChange={(test) => setOps({ cicd: { test } })}
          />
          <Toggle
            label="Build and push the image"
            checked={ops.cicd.buildPush}
            onChange={(buildPush) => setOps({ cicd: { buildPush } })}
          />
          <Toggle
            label="Trigger an ArgoCD sync"
            description="Commits the new image tag to the chart."
            checked={ops.cicd.argoSync}
            disabled={!ops.gitops.enabled}
            disabledReason="Requires ArgoCD to be enabled."
            onChange={(argoSync) => setOps({ cicd: { argoSync } })}
          />
        </div>
      </Section>
    </div>
  );
}
