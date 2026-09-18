import Link from 'next/link';
import { cn } from '../../lib/cn';
import { facetLabel, relativeTime, type CatalogEntry, type CiStatus } from '../../lib/catalog';
import { serviceHref } from '../../lib/service-detail';
import { Badge, Card, type BadgeTone } from '../ui';

const LIFECYCLE_TONES: Record<string, BadgeTone> = {
  PRODUCTION: 'success',
  EXPERIMENTAL: 'neutral',
  DEPRECATED: 'warning',
};

const CI_LABELS: Record<CiStatus, string> = {
  success: 'CI passing',
  failure: 'CI failing',
  pending: 'CI running',
  unknown: 'CI status not checked yet',
};

const CI_COLOURS: Record<CiStatus, string> = {
  success: 'bg-[hsl(var(--success))]',
  failure: 'bg-[hsl(var(--destructive))]',
  pending: 'bg-[hsl(var(--warning))]',
  unknown: 'bg-[hsl(var(--muted-foreground))]/40',
};

/** Colour is never the only signal: the dot carries its meaning as text for assistive tech. */
export function CiDot({ status }: { status: CiStatus }) {
  return (
    <span className="inline-flex items-center" title={CI_LABELS[status]}>
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', CI_COLOURS[status])} />
      <span className="sr-only">{CI_LABELS[status]}</span>
    </span>
  );
}

function LifecycleChip({ lifecycle }: { lifecycle: string }) {
  return (
    <Badge tone={LIFECYCLE_TONES[lifecycle] ?? 'neutral'}>
      {facetLabel('lifecycle', lifecycle)}
    </Badge>
  );
}

/** Framework · runtime · database · deployment target, each only when the service has one. */
function StackBadges({ entry }: { entry: CatalogEntry }) {
  const items: Array<[string, string]> = [];
  if (entry.framework) items.push(['framework', facetLabel('framework', entry.framework)]);
  if (entry.runtime) items.push(['runtime', facetLabel('runtime', entry.runtime)]);
  if (entry.database) items.push(['database', facetLabel('database', entry.database)]);
  if (entry.target) items.push(['target', facetLabel('target', entry.target)]);

  return (
    <ul aria-label="Stack" className="flex flex-wrap gap-1.5">
      {items.map(([kind, label]) => (
        <li key={kind}>
          <Badge>{label}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** The reconciler's last-commit time once it has one; until then, when the entry last changed. */
function Activity({ entry, now }: { entry: CatalogEntry; now: Date }) {
  const at = entry.lastCommitAt ?? entry.updatedAt;
  return (
    <time dateTime={at.toISOString()} title={at.toISOString()}>
      {entry.lastCommitAt ? 'last commit' : 'updated'} {relativeTime(at, now)}
    </time>
  );
}

export function ServiceGrid({ entries, now }: { entries: readonly CatalogEntry[]; now: Date }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Card className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={serviceHref(entry.org, entry.slug)}
                  className="focus-ring text-sm font-medium underline-offset-4 hover:underline"
                >
                  {entry.displayName}
                </Link>
                <p className="truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">
                  {entry.org}/{entry.slug}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CiDot status={entry.ciStatus} />
                <LifecycleChip lifecycle={entry.lifecycle} />
              </div>
            </div>

            {entry.description ? (
              <p className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
                {entry.description}
              </p>
            ) : null}

            <StackBadges entry={entry} />

            <p className="mt-auto flex flex-wrap gap-x-2 text-xs text-[hsl(var(--muted-foreground))]">
              <span className="text-[hsl(var(--foreground))]">{entry.clientName}</span>
              {entry.ownerTeam ? <span>· {entry.ownerTeam}</span> : null}
              <span>
                · <Activity entry={entry} now={now} />
              </span>
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function ServiceTable({ entries, now }: { entries: readonly CatalogEntry[]; now: Date }) {
  return (
    // The table scrolls inside its own box; the page never scrolls sideways.
    <div className="overflow-x-auto rounded-[var(--radius)] border bg-[hsl(var(--card))]">
      <table className="w-full min-w-[56rem] text-left text-xs">
        <thead className="border-b text-[11px] tracking-wide text-[hsl(var(--muted-foreground))] uppercase">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Service
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Client
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Stack
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Lifecycle
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              CI
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Owner team
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Activity
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-[hsl(var(--muted))]/50">
              <th scope="row" className="px-4 py-2.5 font-normal">
                <Link
                  href={serviceHref(entry.org, entry.slug)}
                  className="focus-ring text-sm font-medium underline-offset-4 hover:underline"
                >
                  {entry.displayName}
                </Link>
                <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                  {entry.org}/{entry.slug}
                </p>
              </th>
              <td className="px-3 py-2.5">{entry.clientName}</td>
              <td className="px-3 py-2.5">
                <StackBadges entry={entry} />
              </td>
              <td className="px-3 py-2.5">
                <LifecycleChip lifecycle={entry.lifecycle} />
              </td>
              <td className="px-3 py-2.5">
                <CiDot status={entry.ciStatus} />
              </td>
              <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">
                {entry.ownerTeam ?? '—'}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-[hsl(var(--muted-foreground))]">
                <Activity entry={entry} now={now} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
