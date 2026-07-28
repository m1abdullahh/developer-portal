'use client';

import {
  UI_FRAMEWORKS as FRAMEWORKS,
  UI_MODULES as MODULES,
  UI_STATES as STATES,
  UI_STYLINGS as STYLINGS,
  isVueFramework,
  moduleGate,
  resolveState,
  resolveStyling,
} from '@idp/core';
import { useWizard } from '../../lib/wizard-store';
import {
  UI_FRAMEWORKS,
  UI_MODULES,
  UI_STATES,
  UI_STYLINGS,
  comingSoonReason,
} from '../../lib/labels';
import { Banner, OptionCard, Section, Toggle } from '../ui';

/**
 * Step 2 — the frontend layer.
 *
 * Two contradictions from the PRD surface visibly here. Choosing Nuxt relabels the state and
 * styling options to their Vue equivalents rather than offering React libraries that cannot work
 * (contradictions 1 and 2), and each page module states its own prerequisite instead of simply
 * being missing.
 */
export function Step2Ui() {
  const { ui, api, toggleUiLayer, setFramework, setStyling, setUiState, toggleModule } =
    useWizard();

  if (!ui) {
    return (
      <div className="space-y-6">
        <Banner tone="neutral">This project has no frontend. It will generate an API only.</Banner>
        <Toggle
          label="Include a frontend layer"
          description="Adds a UI application alongside the API."
          checked={false}
          onChange={() => toggleUiLayer(true)}
        />
      </div>
    );
  }

  const vue = isVueFramework(ui.framework);
  const gateInput = {
    hasApi: api !== null,
    hasDatabase: api !== null && api.database !== 'none',
    authMode: api?.middleware.auth ?? ('none' as const),
  };

  return (
    <div className="space-y-8">
      <Toggle
        label="Include a frontend layer"
        description="Uncheck to generate an API-only project."
        checked
        onChange={() => toggleUiLayer(false)}
      />

      <Section title="Framework">
        <div className="grid gap-3 sm:grid-cols-3">
          {FRAMEWORKS.map((framework) => {
            const meta = UI_FRAMEWORKS[framework];
            return (
              <OptionCard
                key={framework}
                title={meta.label}
                description={meta.description}
                selected={ui.framework === framework}
                disabled={Boolean(meta.comingIn)}
                disabledReason={comingSoonReason(meta)}
                badge={meta.comingIn}
                onSelect={() => setFramework(framework)}
              />
            );
          })}
        </div>
      </Section>

      {vue ? (
        <Banner>
          Nuxt renders Vue, so the styling and state options below are substituted for their Vue
          equivalents. The generated project gets the equivalent library, never a React one that
          cannot work.
        </Banner>
      ) : null}

      <Section title="Styling">
        <div className="grid gap-3 sm:grid-cols-3">
          {STYLINGS.map((styling) => {
            const meta = UI_STYLINGS[styling];
            // The resolver decides what this option actually means for the chosen framework.
            const resolved = resolveStyling(ui.framework, styling);
            return (
              <OptionCard
                key={styling}
                title={vue ? resolved.label : meta.label}
                description={vue ? resolved.note : meta.description}
                selected={ui.styling === styling}
                disabled={Boolean(meta.comingIn)}
                disabledReason={comingSoonReason(meta)}
                badge={meta.comingIn}
                onSelect={() => setStyling(styling)}
              />
            );
          })}
        </div>
      </Section>

      <Section title="State management">
        <div className="grid gap-3 sm:grid-cols-4">
          {STATES.map((state) => {
            const meta = UI_STATES[state];
            const resolved = resolveState(ui.framework, state);
            return (
              <OptionCard
                key={state}
                title={vue ? resolved.label : meta.label}
                description={vue ? resolved.note : meta.description}
                selected={ui.state === state}
                disabled={Boolean(meta.comingIn)}
                disabledReason={comingSoonReason(meta)}
                badge={meta.comingIn}
                onSelect={() => setUiState(state)}
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="Page modules"
        description="Pre-built screens. Each states its own prerequisite when unavailable."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {MODULES.map((module) => {
            const meta = UI_MODULES[module];
            const gate = moduleGate(module, gateInput);
            // Two different reasons to be unavailable, and the user needs to know which: a
            // missing prerequisite is fixable in Step 3, a missing recipe is not fixable at all.
            const disabled = Boolean(meta.comingIn) || !gate.enabled;
            const reason = meta.comingIn ? comingSoonReason(meta) : gate.reason;

            return (
              <Toggle
                key={module}
                label={meta.label}
                description={meta.description}
                checked={ui.modules[module]}
                disabled={disabled}
                disabledReason={reason}
                onChange={(enabled) => toggleModule(module, enabled)}
              />
            );
          })}
        </div>
      </Section>
    </div>
  );
}
