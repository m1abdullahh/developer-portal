import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatDuration, type Breakdown, type FleetStats } from '../../lib/catalog';

/**
 * The fleet at a glance (doc 07 §2) — always the whole fleet, whatever the filters say.
 *
 * The last tile is the PRD's core metric made visible: how long a provision actually takes,
 * measured from the job records rather than claimed. It states its sample size because a median
 * of two jobs and a median of two hundred are different kinds of number.
 */
export function FleetStatsStrip({ stats }: { stats: FleetStats }) {
  return (
    <section
      aria-label="Fleet statistics"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
    >
      <Tile label="Services" value={stats.total} />
      <Tile label="By deployment target">
        <BreakdownList items={stats.byTarget} />
      </Tile>
      <Tile label="By runtime">
        <BreakdownList items={stats.byRuntime} />
      </Tile>
      <Tile label="Provisioned this month" value={stats.provisionedThisMonth} />
      <Tile
        label="Failing CI"
        value={stats.failingCi}
        tone={stats.failingCi > 0 ? 'danger' : 'neutral'}
      />
      <Tile
        label="Median provision time"
        value={stats.medianProvisionMs === null ? '—' : formatDuration(stats.medianProvisionMs)}
        hint={
          stats.provisionSamples === 0
            ? 'No completed provisions yet'
            : `Submit to repository ready · ${stats.provisionSamples} ${
                stats.provisionSamples === 1 ? 'job' : 'jobs'
              }`
        }
      />
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  tone = 'neutral',
  children,
}: {
  label: string;
  value?: string | number;
  hint?: string;
  tone?: 'neutral' | 'danger';
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border bg-[hsl(var(--card))] px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">
        {label}
      </p>
      {value !== undefined ? (
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            tone === 'danger' && 'text-[hsl(var(--destructive))]',
          )}
        >
          {value}
        </p>
      ) : null}
      {children}
      {hint ? (
        <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{hint}</p>
      ) : null}
    </div>
  );
}

function BreakdownList({ items }: { items: readonly Breakdown[] }) {
  if (items.length === 0) {
    return <p className="mt-1 text-2xl font-semibold text-[hsl(var(--muted-foreground))]">—</p>;
  }
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs">
      {items.map((item) => (
        <li key={item.value} className="flex items-baseline justify-between gap-2">
          <span className="truncate" title={item.label}>
            {item.label}
          </span>
          <span className="font-semibold tabular-nums">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}
