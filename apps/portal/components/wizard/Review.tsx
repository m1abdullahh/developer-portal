'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { safeParseProjectSpec } from '@idp/core';
import { toSpec, useWizard } from '../../lib/wizard-store';
import { Banner, Button, Card, Section } from '../ui';

/**
 * Step 5 — review and submit.
 *
 * Shows the exact ProjectSpec that will be sent, because this is the artefact the whole system
 * consumes: the same JSON reaches the generator, the catalog and `idp generate`. Someone
 * debugging a provision a month later starts from this object, so hiding it behind a summary
 * would be a false kindness.
 */
export function Review({ canProvision }: { canProvision: boolean }) {
  const router = useRouter();
  const state = useWizard();
  const { submitting, submitError, setSubmitting, goTo } = state;
  const [showSpec, setShowSpec] = useState(false);

  const spec = toSpec(state);
  const parsed = safeParseProjectSpec(spec);

  async function submit() {
    setSubmitting(true, undefined);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec),
      });

      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setSubmitting(false, body.error ?? `Submission failed (${response.status}).`);
        return;
      }

      router.push(`/jobs/${body.id}`);
    } catch (error) {
      setSubmitting(false, error instanceof Error ? error.message : 'Submission failed.');
    }
  }

  return (
    <div className="space-y-6">
      {!parsed.success ? (
        <Banner tone="danger">
          <p className="font-medium">This configuration is not yet valid.</p>
          <ul className="mt-2 space-y-1 text-xs">
            {parsed.error.issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => goTo(stepForPath(String(issue.path[0] ?? '')))}
                >
                  {issue.path.join('.') || 'spec'}
                </button>
                {' — '}
                {issue.message}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}

      {!canProvision ? (
        <Banner tone="warning">
          Your role can view the catalog but not create projects. Ask an administrator for the
          provisioner role.
        </Banner>
      ) : null}

      <Section
        title="What will happen"
        description="In this order. Nothing external happens until generation succeeds."
      >
        <Card>
          <ol className="space-y-2 text-sm">
            <Stage
              n={1}
              title="Generate"
              detail="Resolve recipes, render, merge, codemod, verify — all in memory."
            />
            <Stage n={2} title="Create" detail="Create the repository in your organisation." />
            <Stage n={3} title="Push" detail="Push every file as a single commit." />
            <Stage n={4} title="Configure" detail="Branch protection, team access and topics." />
            <Stage n={5} title="Register" detail="Record the service in the catalog." />
          </ol>
        </Card>
      </Section>

      <Section title="The specification">
        <Button variant="secondary" onClick={() => setShowSpec((v) => !v)}>
          {showSpec ? 'Hide' : 'Show'} ProjectSpec JSON
        </Button>
        {showSpec ? (
          <pre className="max-h-96 overflow-auto rounded-[var(--radius)] border bg-[hsl(var(--muted))] p-4 text-xs">
            {JSON.stringify(spec, null, 2)}
          </pre>
        ) : null}
      </Section>

      {submitError ? <Banner tone="danger">{submitError}</Banner> : null}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!parsed.success || submitting || !canProvision}>
          {submitting ? 'Creating…' : 'Create project'}
        </Button>
        <Button variant="ghost" onClick={() => goTo(4)} disabled={submitting}>
          Back
        </Button>
      </div>
    </div>
  );
}

function Stage({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[10px] font-semibold">
        {n}
      </span>
      <span>
        <span className="font-medium">{title}</span>{' '}
        <span className="text-[hsl(var(--muted-foreground))]">{detail}</span>
      </span>
    </li>
  );
}

/** Sends a validation error back to the step that owns the field. */
function stepForPath(root: string): 1 | 2 | 3 | 4 {
  if (root === 'ui') return 2;
  if (root === 'api') return 3;
  if (root === 'ops') return 4;
  return 1;
}
