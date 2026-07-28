'use client';

import { useEffect, useRef } from 'react';
import { DEPLOYMENT_TARGETS as TARGETS, REPO_VISIBILITIES, slugify } from '@idp/core';
import { useWizard, validateStep } from '../../lib/wizard-store';
import { DEPLOYMENT_TARGETS, VISIBILITIES } from '../../lib/labels';
import { Badge, Field, Input, OptionCard, Section, Toggle } from '../ui';

/**
 * Step 1 — identity, ownership and destination.
 *
 * The slug is the interesting field: it becomes the repository name, the Kubernetes namespace
 * and the image tag, so it is checked against GitHub live rather than at submit time. Finding out
 * the name is taken after configuring four steps is the failure this avoids.
 */
export function Step1Metadata() {
  const { meta, setMeta, setRepo, setDeploymentTarget, slugStatus, slugMessage, setSlugStatus } =
    useWizard();
  const state = useWizard();
  const errors = validateStep(state, 1).errors;

  // Tracks whether the user has typed their own slug. Once they have, the name field stops
  // overwriting it — silently rewriting someone's deliberate choice is worse than a stale suggestion.
  const slugEdited = useRef(false);

  useEffect(() => {
    if (!meta.slug) {
      setSlugStatus('idle');
      return;
    }

    // Debounced: a check per keystroke would spend the GitHub rate limit on prefixes of a name
    // nobody is going to use.
    const timer = setTimeout(() => {
      setSlugStatus('checking');
      fetch(
        `/api/slug-check?org=${encodeURIComponent(meta.repo.org)}&slug=${encodeURIComponent(meta.slug)}`,
      )
        .then((r) => r.json())
        .then((body: { status: 'available' | 'taken' | 'unknown'; reason?: string }) =>
          setSlugStatus(body.status, body.reason),
        )
        .catch(() => setSlugStatus('unknown', 'Could not reach GitHub to check the name.'));
    }, 450);

    return () => clearTimeout(timer);
  }, [meta.slug, meta.repo.org, setSlugStatus]);

  return (
    <div className="space-y-8">
      <Section
        title="Project identity"
        description="What this project is called and who it is for."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Project name"
            required
            htmlFor="projectName"
            error={errors['meta.projectName']}
            hint="The human-readable name, e.g. “Acme Health Backend”."
          >
            <Input
              id="projectName"
              value={meta.projectName}
              placeholder="Acme Health Backend"
              onChange={(e) => {
                const projectName = e.target.value;
                setMeta(
                  slugEdited.current
                    ? { projectName }
                    : { projectName, slug: slugify(projectName) },
                );
              }}
            />
          </Field>

          <Field
            label="Technical ID"
            required
            htmlFor="slug"
            error={errors['meta.slug']}
            hint="Becomes the repository name, namespace and image tag. Lowercase, hyphenated."
          >
            <div className="space-y-1.5">
              <Input
                id="slug"
                value={meta.slug}
                placeholder="acme-health-backend"
                onChange={(e) => {
                  slugEdited.current = true;
                  setMeta({ slug: e.target.value });
                }}
              />
              <SlugStatus status={slugStatus} message={slugMessage} />
            </div>
          </Field>

          <Field label="Client" required htmlFor="clientName" error={errors['meta.clientName']}>
            <Input
              id="clientName"
              value={meta.clientName}
              placeholder="Acme Health"
              onChange={(e) => setMeta({ clientName: e.target.value })}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={errors['meta.description']}
            hint="Optional. Shown in the catalog and set as the repository description."
          >
            <Input
              id="description"
              value={meta.description ?? ''}
              placeholder="Patient records service"
              onChange={(e) => setMeta({ description: e.target.value || undefined })}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Deployment target"
        description="This reshapes Step 4 — a managed platform has no Kubernetes layer."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {TARGETS.map((target) => (
            <OptionCard
              key={target}
              title={DEPLOYMENT_TARGETS[target].label}
              description={DEPLOYMENT_TARGETS[target].description}
              selected={meta.deploymentTarget === target}
              onSelect={() => setDeploymentTarget(target)}
            />
          ))}
        </div>
      </Section>

      <Section title="Repository" description="Where the generated code will live.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GitHub organisation" required htmlFor="org" error={errors['meta.repo.org']}>
            <Input
              id="org"
              value={meta.repo.org}
              placeholder="acme-internal"
              onChange={(e) => setRepo({ org: e.target.value })}
            />
          </Field>

          <Field label="Default branch" htmlFor="defaultBranch">
            <Input
              id="defaultBranch"
              value={meta.repo.defaultBranch}
              onChange={(e) => setRepo({ defaultBranch: e.target.value })}
            />
          </Field>

          <Field
            label="Teams with write access"
            htmlFor="teams"
            hint="Comma-separated team slugs. Leave empty to grant no team access."
          >
            <Input
              id="teams"
              value={meta.repo.teamSlugs.join(', ')}
              placeholder="platform, sre"
              onChange={(e) =>
                setRepo({
                  teamSlugs: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {REPO_VISIBILITIES.map((visibility) => (
            <OptionCard
              key={visibility}
              title={VISIBILITIES[visibility].label}
              description={VISIBILITIES[visibility].description}
              selected={meta.repo.visibility === visibility}
              onSelect={() => setRepo({ visibility })}
            />
          ))}
        </div>

        <Toggle
          label="Protect the default branch"
          description="Requires a pull request with one approval, and blocks force pushes."
          checked={meta.repo.branchProtection}
          onChange={(branchProtection) => setRepo({ branchProtection })}
        />
      </Section>
    </div>
  );
}

function SlugStatus({ status, message }: { status: string; message?: string | undefined }) {
  if (status === 'idle') return null;
  if (status === 'checking') {
    return <span className="text-xs text-[hsl(var(--muted-foreground))]">Checking…</span>;
  }
  if (status === 'available') return <Badge tone="success">Available</Badge>;
  if (status === 'taken') return <Badge tone="danger">{message ?? 'Already taken'}</Badge>;

  // `unknown` is deliberately distinct from `taken`: a failed lookup must not read as a
  // collision, or a GitHub outage becomes "that name is taken" for every user.
  return <Badge tone="warning">{message ?? 'Could not verify — creation may still fail'}</Badge>;
}
