import { apiOnlyGoSpec, apiOnlyPythonSpec, spineSpec, uiOnlyVercelSpec } from '@idp/core';
import { getPrisma, writeSpec } from '@idp/db';

/**
 * A small, varied fleet for the catalog suite.
 *
 * Written straight to the database rather than provisioned through the wizard: five provisions
 * would take minutes and prove nothing about filtering. Every row carries the run's id in its
 * slug and its client name, so the suite can look only at its own services — the database is
 * shared with the wizard suite, and locally with whatever the developer has provisioned.
 *
 * The specs are the real fixtures, not hand-written fragments, so the rows are exactly what a
 * provision stores and the detail page can render them.
 *
 * A plain Node script, run as a child process by the suite, rather than a module the suite
 * imports: Playwright transpiles everything a test file imports, and its transform cannot parse
 * the generated Prisma client (`export * as`). Node can, so the database is touched from Node.
 *
 *   node e2e/catalog-seed.mjs seed <runId>     → prints the seeded fleet as JSON
 *   node e2e/catalog-seed.mjs unseed <runId>
 */

const DAY = 24 * 3600 * 1000;

export async function seedCatalog(runId) {
  const prisma = getPrisma();
  const prefix = `e2e-cat-${runId}`;
  const clientA = `Catalog Co ${runId}`;
  const clientB = `Other Client ${runId}`;
  const now = Date.now();

  const meta = (name, projectName, clientName) => ({
    slug: `${prefix}-${name}`,
    projectName,
    clientName,
  });

  const services = [
    {
      spec: spineSpec({ meta: meta('shop', 'Shop Web', clientA) }),
      lifecycle: 'PRODUCTION',
      ciStatus: 'success',
      ownerTeam: 'storefront',
      tags: ['idp-generated', 'retail'],
      description: 'The customer-facing storefront.',
      updatedDaysAgo: 1,
      createdDaysAgo: 40,
    },
    {
      spec: apiOnlyGoSpec({ meta: meta('ledger', 'Ledger', clientA) }),
      lifecycle: 'PRODUCTION',
      ciStatus: 'failure',
      ownerTeam: 'payments',
      tags: ['idp-generated', 'payments'],
      description: 'Double-entry billing service.',
      updatedDaysAgo: 3,
      createdDaysAgo: 30,
    },
    {
      spec: apiOnlyPythonSpec({ meta: meta('reports', 'Reports', clientA) }),
      lifecycle: 'EXPERIMENTAL',
      ciStatus: 'pending',
      ownerTeam: null,
      tags: ['idp-generated'],
      description: null,
      updatedDaysAgo: 2,
      createdDaysAgo: 5,
    },
    {
      spec: uiOnlyVercelSpec({ meta: meta('site', 'Marketing Site', clientB) }),
      lifecycle: 'EXPERIMENTAL',
      // No health row at all: the reconciler has not seen this one, which must read as unknown.
      ciStatus: null,
      ownerTeam: null,
      tags: ['idp-generated'],
      description: 'Campaign pages.',
      updatedDaysAgo: 8,
      createdDaysAgo: 8,
    },
    {
      spec: spineSpec({
        ui: null,
        api: { database: 'none', orm: 'none' },
        meta: meta('gateway', 'Legacy Gateway', clientB),
      }),
      lifecycle: 'DEPRECATED',
      ciStatus: 'success',
      ownerTeam: 'platform',
      tags: ['idp-generated'],
      description: null,
      updatedDaysAgo: 60,
      createdDaysAgo: 400,
    },
  ];

  for (const [index, item] of services.entries()) {
    const { spec } = item;
    const service = await prisma.service.create({
      data: {
        org: spec.meta.repo.org,
        slug: spec.meta.slug,
        displayName: spec.meta.projectName,
        clientName: spec.meta.clientName,
        description: item.description,
        repoUrl: `https://github.com/${spec.meta.repo.org}/${spec.meta.slug}`,
        repoId: `${prefix}-${index}`,
        spec: writeSpec(spec),
        specVersion: spec.specVersion,
        lifecycle: item.lifecycle,
        ownerTeam: item.ownerTeam,
        tags: JSON.stringify(item.tags),
        createdAt: new Date(now - item.createdDaysAgo * DAY),
        updatedAt: new Date(now - item.updatedDaysAgo * DAY),
      },
    });

    if (item.ciStatus !== null) {
      await prisma.serviceHealth.create({
        data: { serviceId: service.id, ciStatus: item.ciStatus },
      });
    }

    // Three of them arrived through a job, so the median tile has records to measure.
    if (index < 3) {
      await prisma.provisionJob.create({
        data: {
          id: `${prefix}-job-${index}`,
          serviceId: service.id,
          org: service.org,
          slug: service.slug,
          spec: service.spec,
          specHash: `${prefix}-hash-${index}`,
          status: 'completed',
          durationMs: [9_000, 13_200, 21_000][index],
          finishedAt: new Date(now - item.createdDaysAgo * DAY),
        },
      });
    }
  }

  return { clientA, clientB, prefix, count: services.length };
}

export async function unseedCatalog(runId) {
  const prisma = getPrisma();
  const prefix = `e2e-cat-${runId}`;
  await prisma.provisionJob.deleteMany({ where: { id: { startsWith: prefix } } });
  // ServiceHealth goes with its service (onDelete: Cascade).
  await prisma.service.deleteMany({ where: { slug: { startsWith: prefix } } });
}

const [command, runId] = process.argv.slice(2);
if (!runId || (command !== 'seed' && command !== 'unseed')) {
  console.error('usage: node e2e/catalog-seed.mjs <seed|unseed> <runId>');
  process.exit(2);
}
if (command === 'seed') process.stdout.write(`${JSON.stringify(await seedCatalog(runId))}\n`);
else await unseedCatalog(runId);
await getPrisma().$disconnect();
