import { redirect } from 'next/navigation';
import { Banner, Button, Card } from '../../components/ui';
import { authUnconfigured, githubOrg, isDevAuth, signIn } from '../../lib/auth';
import { currentUser } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function SignIn() {
  if (await currentUser().catch(() => null)) redirect('/');

  const org = githubOrg();

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {org
            ? `Access is limited to members of the ${org} GitHub organisation.`
            : 'Access is limited to members of the configured GitHub organisation.'}
        </p>
      </div>

      {authUnconfigured() ? (
        <Banner tone="danger">
          No sign-in method is configured, so nobody can authenticate. Set the GitHub OAuth
          variables, or <code>AUTH_DEV_LOGIN</code> for local development.
        </Banner>
      ) : null}

      <Card className="space-y-4">
        {process.env.AUTH_GITHUB_ID ? (
          <form
            action={async () => {
              'use server';
              await signIn('github', { redirectTo: '/' });
            }}
          >
            <Button type="submit" className="w-full">
              Continue with GitHub
            </Button>
          </form>
        ) : null}

        {isDevAuth() ? (
          <form
            action={async () => {
              'use server';
              await signIn('dev', { redirectTo: '/' });
            }}
          >
            <Button type="submit" variant="secondary" className="w-full">
              Development sign-in ({process.env.AUTH_DEV_LOGIN})
            </Button>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Local identity, refused when NODE_ENV is production.
            </p>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
