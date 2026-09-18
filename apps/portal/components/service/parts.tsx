import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { SERVICE_TABS, TAB_TITLES, serviceHref, type ServiceTab } from '../../lib/service-detail';

/** The five tabs, as links: a tab is an address, so "look at its Deployments tab" can be sent. */
export function ServiceTabs({
  org,
  slug,
  active,
}: {
  org: string;
  slug: string;
  active: ServiceTab;
}) {
  return (
    <nav aria-label="Service sections" className="flex gap-1 overflow-x-auto border-b">
      {SERVICE_TABS.map((tab) => (
        <Link
          key={tab}
          href={serviceHref(org, slug, tab)}
          scroll={false}
          aria-current={tab === active ? 'page' : undefined}
          className={cn(
            'focus-ring border-b-2 px-3 py-2 text-sm whitespace-nowrap',
            tab === active
              ? 'border-[hsl(var(--accent))] font-medium'
              : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
          )}
        >
          {TAB_TITLES[tab]}
        </Link>
      ))}
    </nav>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Says what the reader is looking at. Generated output is reproduced from the stored
 * specification — it is the repository as the portal made it, not as it stands after a month of
 * commits — and a page that blurred the two would be trusted for the wrong thing.
 */
export function AsGenerated({ children }: { children?: ReactNode }) {
  return (
    <p className="text-xs text-[hsl(var(--muted-foreground))]">
      Reproduced from the stored specification — as generated, not as the repository stands today.
      {children ? <> {children}</> : null}
    </p>
  );
}

export function Pending({ what }: { what: string }) {
  return (
    <p
      role="status"
      className="animate-pulse rounded-[var(--radius)] border border-dashed px-4 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]"
    >
      Regenerating {what} from the stored specification…
    </p>
  );
}

/** For a value only the health reconciler can know, before it has looked. */
export function NotCheckedYet() {
  return <span className="text-[hsl(var(--muted-foreground))]">Not checked yet</span>;
}
