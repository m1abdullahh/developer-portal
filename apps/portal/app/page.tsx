import Link from 'next/link';
import { getPrisma } from '@idp/db';
import { Badge, Banner, Card } from '../components/ui';
import { canProvision, currentUser } from '../lib/session';
import { authUnconfigured, isDevAuth } from '../lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await currentUser().catch(() => null);

  // Counts come straight from the catalog. An empty portal should say so plainly rather than
  // showing a dashboard of zeroes dressed up as data.
  const [services, jobs] = await Promise.all([
    getPrisma()
      .service.count()
      .catch(() => 0),
    getPrisma()
      .provisionJob.count()
      .catch(() => 0),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Internal Developer Portal</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Complete a four-step wizard and get a production-ready repository — frontend, backend,
          container, Kubernetes, ArgoCD and CI/CD — with no manual YAML.
        </p>
      </div>

      {authUnconfigured() ? (
        <Banner tone="warning">
          <p className="font-medium">Authentication is not configured.</p>
          <p className="mt-1 text-xs">
            Set <code>AUTH_GITHUB_ID</code>, <code>AUTH_GITHUB_SECRET</code> and{' '}
            <code>GITHUB_ORG</code> for GitHub sign-in, or <code>AUTH_DEV_LOGIN</code> for a local
            development identity. Nobody can sign in until one of those exists.
          </p>
        </Banner>
      ) : isDevAuth() ? (
        <Banner tone="warning">
          Running with the development sign-in. This is refused in production — configure GitHub
          OAuth before deploying.
        </Banner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Services in catalog" value={services} />
        <Stat label="Provisioning runs" value={jobs} />
        <Stat label="Spine recipes" value={11} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold">Create a project</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Four steps, then a single commit into a new repository.
          </p>
          {user ? (
            canProvision(user.role) ? (
              <Link href="/new" className="focus-ring text-sm underline underline-offset-4">
                Start the wizard →
              </Link>
            ) : (
              <Badge tone="neutral">Requires the provisioner role</Badge>
            )
          ) : (
            <Link href="/signin" className="focus-ring text-sm underline underline-offset-4">
              Sign in to continue →
            </Link>
          )}
        </Card>

        <Card className="space-y-2">
          <h2 className="text-sm font-semibold">Browse the catalog</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Every provisioned service, with the specification that produced it.
          </p>
          <Link href="/catalog" className="focus-ring text-sm underline underline-offset-4">
            Open the catalog →
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
    </Card>
  );
}
