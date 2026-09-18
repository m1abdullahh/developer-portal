import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '../../../components/ui';
import { serviceHref } from '../../../lib/service-detail';
import { findServicesBySlug } from '../../../lib/service-detail-data';

export const dynamic = 'force-dynamic';

/**
 * `/catalog/<slug>` — the address a service had before it carried its organisation.
 *
 * Links in the wild (old job pages, bookmarks, messages) still point here, so it resolves rather
 * than 404s. The segment is named `org` because Next allows one parameter name per position and
 * the real route is `/catalog/[org]/[slug]`; at this depth its value is a service ID.
 *
 * An ID is unique only within an organisation. One match redirects; several are a genuine
 * ambiguity, and the honest answer to an ambiguous address is to ask which.
 */
export default async function LegacyServiceAddress({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const slug = decodeURIComponent((await params).org);
  const matches = await findServicesBySlug(slug).catch(() => []);

  if (matches.length === 0) notFound();
  const [only] = matches;
  if (matches.length === 1 && only) redirect(serviceHref(only.org, only.slug));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Which {slug}?</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        More than one organisation has a service with this ID.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {matches.map((match) => (
          <li key={`${match.org}/${match.slug}`}>
            <Card>
              <Link
                href={serviceHref(match.org, match.slug)}
                className="focus-ring text-sm font-medium underline-offset-4 hover:underline"
              >
                {match.displayName}
              </Link>
              <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                {match.org}/{match.slug}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
