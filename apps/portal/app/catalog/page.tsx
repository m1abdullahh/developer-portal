import Link from 'next/link';
import { getPrisma, readSpecUnchecked } from '@idp/db';
import { Badge, Card } from '../../components/ui';
import { currentUser } from '../../lib/session';

export const dynamic = 'force-dynamic';

interface CatalogRow {
  id: string;
  org: string;
  slug: string;
  displayName: string;
  clientName: string;
  description: string | null;
  repoUrl: string;
  lifecycle: string;
  createdAt: Date;
  stack: string[];
}

/**
 * The service catalog.
 *
 * Every row's stack summary is derived from the stored ProjectSpec rather than from separate
 * columns. That is the point of storing the spec: the catalog cannot drift from what was
 * actually generated, because it is reading the same object the generator consumed (doc 07 §1).
 */
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; client?: string }>;
}) {
  const user = await currentUser().catch(() => null);
  const { q, client } = await searchParams;

  const services = await getPrisma()
    .service.findMany({
      where: {
        ...(client ? { clientName: client } : {}),
        ...(q
          ? {
              OR: [
                { displayName: { contains: q } },
                { slug: { contains: q } },
                { clientName: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    .catch(() => []);

  const rows: CatalogRow[] = services.map((service) => ({
    id: service.id,
    org: service.org,
    slug: service.slug,
    displayName: service.displayName,
    clientName: service.clientName,
    description: service.description,
    repoUrl: service.repoUrl,
    lifecycle: service.lifecycle,
    createdAt: service.createdAt,
    stack: summariseStack(readSpecUnchecked(service.spec, service.id)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Service catalog</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Every provisioned service, with the specification that produced it.
          </p>
        </div>
        {user ? (
          <Link href="/new" className="focus-ring text-sm underline underline-offset-4">
            New project →
          </Link>
        ) : null}
      </div>

      <form className="flex gap-2" action="/catalog">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name, ID or client"
          className="focus-ring w-full max-w-sm rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="focus-ring rounded-[var(--radius)] border px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm">
            {q || client
              ? 'No services match that search.'
              : 'No services yet. The first project you create will appear here.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/catalog/${row.slug}`}
                    className="focus-ring text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {row.displayName}
                  </Link>
                  <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                    {row.org}/{row.slug}
                  </p>
                  {row.description ? <p className="mt-1 text-xs">{row.description}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={row.lifecycle === 'PRODUCTION' ? 'success' : 'neutral'}>
                    {row.lifecycle.toLowerCase()}
                  </Badge>
                  {row.stack.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                {row.clientName} · created {row.createdAt.toISOString().slice(0, 10)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Derives the stack badges from a stored spec.
 *
 * Reads defensively rather than through the schema: a service written under an older specVersion
 * must still be listable. A catalog that hides rows it cannot fully parse is worse than one that
 * shows them with fewer badges.
 */
function summariseStack(spec: unknown): string[] {
  if (typeof spec !== 'object' || spec === null) return [];
  const s = spec as {
    ui?: { framework?: string } | null;
    api?: { runtime?: string; database?: string } | null;
    ops?: { k8s?: { enabled?: boolean } };
  };

  const stack: string[] = [];
  if (s.ui?.framework) stack.push(s.ui.framework);
  if (s.api?.runtime) stack.push(s.api.runtime);
  if (s.api?.database && s.api.database !== 'none') stack.push(s.api.database);
  if (s.ops?.k8s?.enabled) stack.push('k8s');
  return stack;
}
