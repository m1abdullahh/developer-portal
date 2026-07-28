import { redirect } from 'next/navigation';
import { WizardShell } from '../../components/wizard/WizardShell';
import { canProvision, currentUser } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function NewProject() {
  const user = await currentUser().catch(() => null);
  if (!user) redirect('/signin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New project</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Your progress is saved automatically — you can leave and come back.
        </p>
      </div>

      {/* The role is resolved on the server and passed down. The wizard is still usable without
          it — configuring and reviewing is useful even if submitting is not permitted. */}
      <WizardShell canProvision={canProvision(user.role)} />
    </div>
  );
}
