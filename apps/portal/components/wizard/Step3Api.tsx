'use client';

import {
  API_PARADIGMS as PARADIGMS,
  API_RUNTIMES as RUNTIMES,
  AUTH_MODES as AUTH,
  DATABASES as DBS,
  ORMS,
  availableOrms,
  availableParadigms,
  ormUnavailableReason,
  paradigmUnavailableReason,
} from '@idp/core';
import { useWizard } from '../../lib/wizard-store';
import {
  API_PARADIGMS,
  API_RUNTIMES,
  AUTH_MODES,
  DATABASES,
  ORM_OPTIONS,
  comingSoonReason,
} from '../../lib/labels';
import { Banner, OptionCard, Section, Toggle } from '../ui';

/**
 * Step 3 — the backend layer.
 *
 * The remaining two PRD contradictions live here. Paradigms and ORMs are filtered by the chosen
 * runtime rather than offered and then rejected: tRPC on Go and Prisma on Python are both
 * impossible, and the option says so rather than disappearing.
 */
export function Step3Api() {
  const {
    api,
    toggleApiLayer,
    setRuntime,
    setParadigm,
    setDatabase,
    setOrm,
    setAuthMode,
    setMiddleware,
    setCache,
  } = useWizard();

  if (!api) {
    return (
      <div className="space-y-6">
        <Banner tone="neutral">
          This project has no backend. It will generate a frontend only.
        </Banner>
        <Toggle
          label="Include an API layer"
          description="Adds a backend service alongside the frontend."
          checked={false}
          onChange={() => toggleApiLayer(true)}
        />
      </div>
    );
  }

  const paradigms = availableParadigms(api.runtime);
  const orms = availableOrms(api.runtime, api.database);

  return (
    <div className="space-y-8">
      <Toggle
        label="Include an API layer"
        description="Uncheck to generate a frontend-only project."
        checked
        onChange={() => toggleApiLayer(false)}
      />

      <Section title="Runtime">
        <div className="grid gap-3 sm:grid-cols-3">
          {RUNTIMES.map((runtime) => {
            const meta = API_RUNTIMES[runtime];
            return (
              <OptionCard
                key={runtime}
                title={meta.label}
                description={meta.description}
                selected={api.runtime === runtime}
                disabled={Boolean(meta.comingIn)}
                disabledReason={comingSoonReason(meta)}
                badge={meta.comingIn}
                onSelect={() => setRuntime(runtime)}
              />
            );
          })}
        </div>
      </Section>

      <Section title="API paradigm">
        <div className="grid gap-3 sm:grid-cols-3">
          {PARADIGMS.map((paradigm) => {
            const meta = API_PARADIGMS[paradigm];
            // Runtime incompatibility outranks "coming soon": telling someone tRPC arrives in P2
            // when they have selected Go would be a promise the matrix cannot keep.
            const incompatible = !paradigms.includes(paradigm);
            const reason = incompatible
              ? (paradigmUnavailableReason(api.runtime, paradigm) ?? undefined)
              : comingSoonReason(meta);

            return (
              <OptionCard
                key={paradigm}
                title={meta.label}
                description={meta.description}
                selected={api.paradigm === paradigm}
                disabled={incompatible || Boolean(meta.comingIn)}
                disabledReason={reason}
                badge={incompatible ? undefined : meta.comingIn}
                onSelect={() => setParadigm(paradigm)}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Database">
        <div className="grid gap-3 sm:grid-cols-3">
          {DBS.map((database) => {
            const meta = DATABASES[database];
            return (
              <OptionCard
                key={database}
                title={meta.label}
                description={meta.description}
                selected={api.database === database}
                disabled={Boolean(meta.comingIn)}
                disabledReason={comingSoonReason(meta)}
                badge={meta.comingIn}
                onSelect={() => setDatabase(database)}
              />
            );
          })}
        </div>
      </Section>

      {api.database !== 'none' ? (
        <Section title="ORM / data access">
          <div className="grid gap-3 sm:grid-cols-3">
            {ORMS.filter((orm) => orm !== 'none').map((orm) => {
              const incompatible = !orms.includes(orm);
              const meta = ORM_OPTIONS[orm];
              /*
               * Two independent reasons to be disabled, and the message must name the right one.
               * Compatibility ("Prisma is a Node.js library") comes from core and depends on the
               * selections; implementedness ("sqlc arrives in P3") is presentation state. An
               * option failing both shows the compatibility reason — no point advertising a
               * timeline for something this runtime could never use.
               */
              const compatReason = ormUnavailableReason(api.runtime, api.database, orm);
              return (
                <OptionCard
                  key={orm}
                  title={meta.label}
                  description={meta.description}
                  selected={api.orm === orm}
                  disabled={incompatible || Boolean(meta.comingIn)}
                  disabledReason={
                    incompatible ? (compatReason ?? undefined) : comingSoonReason(meta)
                  }
                  badge={incompatible ? undefined : meta.comingIn}
                  onSelect={() => setOrm(orm)}
                />
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title="Authentication">
        <div className="grid gap-3 sm:grid-cols-3">
          {AUTH.map((mode) => {
            const meta = AUTH_MODES[mode];
            return (
              <OptionCard
                key={mode}
                title={meta.label}
                description={meta.description}
                selected={api.middleware.auth === mode}
                disabled={Boolean(meta.comingIn)}
                disabledReason={comingSoonReason(meta)}
                badge={meta.comingIn}
                onSelect={() => setAuthMode(mode)}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Middleware" description="Applied in a fixed order regardless of selection.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="CORS"
            description="Origin allowlist read from the environment. Never a wildcard with credentials."
            checked={api.middleware.cors}
            onChange={(cors) => setMiddleware({ cors })}
          />
          <Toggle
            label="Rate limiting"
            description="Per-IP limits, with health and readiness probes exempt."
            checked={api.middleware.rateLimit}
            onChange={(rateLimit) => setMiddleware({ rateLimit })}
          />
          <Toggle
            label="Request validation"
            description="Zod schemas validate every request and generate the OpenAPI document."
            checked={api.middleware.validation}
            onChange={(validation) => setMiddleware({ validation })}
          />
          <Toggle
            label="Structured logging"
            description="Pino with request IDs and redacted authorisation headers."
            checked={api.middleware.logging}
            onChange={(logging) => setMiddleware({ logging })}
          />
          <Toggle
            label="Redis cache"
            description="Adds a cache client and a docker-compose service."
            checked={api.cache}
            onChange={setCache}
          />
        </div>
      </Section>
    </div>
  );
}
