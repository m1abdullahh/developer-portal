'use client';

import { ormLabel, targetUsesKubernetes } from '@idp/core';
import { useWizard } from '../../lib/wizard-store';
import { API_PARADIGMS, API_RUNTIMES, DEPLOYMENT_TARGETS, UI_FRAMEWORKS } from '../../lib/labels';
import { Badge, Card } from '../ui';

/**
 * The running summary.
 *
 * Present on every step so a choice made in Step 1 stays visible while its consequences appear
 * in Step 4. Without it, the deployment target — which silently removes two whole sections — is
 * three clicks out of sight by the time it matters.
 */
export function SummaryRail() {
  const { meta, ui, api, ops } = useWizard();

  return (
    <Card className="sticky top-6 space-y-4 text-sm">
      <div>
        <p className="text-xs tracking-wide text-[hsl(var(--muted-foreground))] uppercase">
          Summary
        </p>
        <p className="mt-1 font-medium">{meta.projectName || 'Untitled project'}</p>
        <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
          {meta.repo.org || 'org'}/{meta.slug || 'slug'}
        </p>
      </div>

      <Row label="Client" value={meta.clientName || '—'} />
      <Row label="Target" value={DEPLOYMENT_TARGETS[meta.deploymentTarget].label} />
      <Row label="Visibility" value={meta.repo.visibility} />

      <Divider />

      <Row label="Frontend" value={ui ? UI_FRAMEWORKS[ui.framework].label : 'None'} muted={!ui} />
      {ui ? <Row label="Styling" value={ui.styling} /> : null}
      {ui ? <Row label="State" value={ui.state} /> : null}

      <Divider />

      <Row label="Backend" value={api ? API_RUNTIMES[api.runtime].label : 'None'} muted={!api} />
      {api ? <Row label="Paradigm" value={API_PARADIGMS[api.paradigm].label} /> : null}
      {api ? (
        <Row
          label="Data"
          value={api.database === 'none' ? 'None' : `${api.database} · ${ormLabel(api.orm)}`}
        />
      ) : null}
      {api ? <Row label="Auth" value={api.middleware.auth} /> : null}

      <Divider />

      <Row label="Container" value={ops.container.strategy} />
      {targetUsesKubernetes(meta.deploymentTarget) ? (
        <>
          <Row
            label="Kubernetes"
            value={ops.k8s.enabled ? `${ops.k8s.replicas} replicas` : 'Off'}
          />
          <Row label="ArgoCD" value={ops.gitops.enabled ? ops.gitops.syncPolicy : 'Off'} />
        </>
      ) : null}
      <Row label="Registry" value={ops.cicd.registry} />

      {/* A count, not a list: the point is to convey scale before submitting, and the exact
          file list is on the review step. */}
      <div className="pt-2">
        <Badge tone="accent">{estimateLayers(ui, api)} layer(s) will be generated</Badge>
      </div>
    </Card>
  );
}

function estimateLayers(ui: unknown, api: unknown): number {
  return (ui ? 1 : 0) + (api ? 1 : 0);
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      <span
        className={muted ? 'text-xs text-[hsl(var(--muted-foreground))]' : 'text-xs font-medium'}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <hr className="border-0 border-t" />;
}
