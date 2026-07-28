'use client';

import { useEffect, useRef } from 'react';
import { isSubmittable, useWizard, validateStep, type WizardStep } from '../../lib/wizard-store';
import { Button } from '../ui';
import { Step1Metadata } from './Step1Metadata';
import { Step2Ui } from './Step2Ui';
import { Step3Api } from './Step3Api';
import { Step4DevOps } from './Step4DevOps';
import { Review } from './Review';
import { SummaryRail } from './SummaryRail';

const STEPS: Array<{ step: WizardStep; title: string; subtitle: string }> = [
  { step: 1, title: 'Project', subtitle: 'Identity and destination' },
  { step: 2, title: 'Frontend', subtitle: 'Framework and pages' },
  { step: 3, title: 'Backend', subtitle: 'Runtime and data' },
  { step: 4, title: 'DevOps', subtitle: 'Container, cluster, CI/CD' },
  { step: 5, title: 'Review', subtitle: 'Confirm and create' },
];

export function WizardShell({ canProvision }: { canProvision: boolean }) {
  const state = useWizard();
  const { step, goTo, next, back, hydrate } = state;
  const hydrated = useRef(false);

  // Restore the draft once on mount. Autosave writes it back on every change, so a reload
  // mid-wizard — or a switch to another machine — resumes rather than starting over.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    fetch('/api/drafts')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { spec?: Record<string, unknown>; step?: number } | null) => {
        if (!body?.spec) return;
        hydrate({
          ...(body.spec as object),
          step: (body.step ?? 1) as WizardStep,
        });
      })
      .catch(() => {
        // A missing or unreadable draft is not an error worth interrupting anyone for.
      });
  }, [hydrate]);

  // Debounced autosave. Saving per keystroke would write a row per character typed.
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      void fetch('/api/drafts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          spec: { meta: state.meta, ui: state.ui, api: state.api, ops: state.ops },
          step: state.step,
        }),
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [state.meta, state.ui, state.api, state.ops, state.step]);

  const validation = validateStep(state, step);
  // Navigation is guarded but never trapped: a user may go back freely, and forward only from a
  // step whose own fields are valid. Blocking backwards movement is how people lose work.
  const canAdvance = step === 5 ? isSubmittable(state) : validation.valid;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <Stepper current={step} visited={state.visited} onSelect={goTo} valid={validation.valid} />

        <div>
          <h2 className="text-lg font-semibold">{STEPS[step - 1]?.title}</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{STEPS[step - 1]?.subtitle}</p>
        </div>

        {step === 1 ? <Step1Metadata /> : null}
        {step === 2 ? <Step2Ui /> : null}
        {step === 3 ? <Step3Api /> : null}
        {step === 4 ? <Step4DevOps /> : null}
        {step === 5 ? <Review canProvision={canProvision} /> : null}

        {step < 5 ? (
          <div className="flex items-center gap-3 border-t pt-6">
            <Button variant="ghost" onClick={back} disabled={step === 1}>
              Back
            </Button>
            <Button onClick={next} disabled={!canAdvance}>
              Continue
            </Button>
            {!canAdvance ? (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                Resolve the errors above to continue.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <SummaryRail />
    </div>
  );
}

function Stepper({
  current,
  visited,
  onSelect,
  valid,
}: {
  current: WizardStep;
  visited: Set<WizardStep>;
  onSelect: (step: WizardStep) => void;
  valid: boolean;
}) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Wizard steps">
      {STEPS.map(({ step, title }) => {
        const isCurrent = step === current;
        // Only visited steps are clickable. Jumping to Step 4 from Step 1 would show validation
        // errors for fields the user has not been offered yet.
        const reachable = visited.has(step) || step < current;

        return (
          <li key={step}>
            <button
              type="button"
              onClick={() => reachable && onSelect(step)}
              disabled={!reachable}
              aria-current={isCurrent ? 'step' : undefined}
              className={[
                'focus-ring rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                isCurrent
                  ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                  : reachable
                    ? 'hover:bg-[hsl(var(--muted))]'
                    : 'cursor-not-allowed opacity-50',
              ].join(' ')}
            >
              <span className="mr-1.5 opacity-70">{step}</span>
              {title}
              {isCurrent && !valid ? <span className="ml-1.5">•</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
