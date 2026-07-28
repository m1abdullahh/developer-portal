/**
 * Wizard draft persistence.
 *
 * Drafts are stored deliberately unvalidated. A half-finished configuration is invalid by
 * definition — that is what makes it a draft — and validating on save would mean nothing could be
 * saved until it was already complete, which defeats the purpose.
 *
 * One draft per user. A second in-progress wizard overwrites the first rather than accumulating
 * rows nobody will ever return to.
 */

import { getPrisma } from '@idp/db';
import { authErrorResponse, requireUser } from '../../../lib/session';
import { ensureUser } from '../../../lib/users';

export const dynamic = 'force-dynamic';

/** Bounded so a crafted request cannot write an unbounded blob to the database. */
const MAX_DRAFT_BYTES = 64 * 1024;

export async function GET(): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Wrapped rather than awaited inline: if the user row cannot be reconciled, the wizard should
  // open empty rather than fail to load at all.
  const draft = await ensureUser(user)
    .then((userId) =>
      getPrisma().draft.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
    )
    .catch(() => null);

  if (!draft) return Response.json({ spec: null, step: 1 });

  try {
    return Response.json({ spec: JSON.parse(draft.spec) as unknown, step: draft.step });
  } catch {
    // A corrupt draft must not block the wizard from opening — start fresh instead.
    return Response.json({ spec: null, step: 1 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as { spec?: unknown; step?: number };
  const serialized = JSON.stringify(body.spec ?? {});

  if (serialized.length > MAX_DRAFT_BYTES) {
    return Response.json({ error: 'Draft too large.' }, { status: 413 });
  }

  const prisma = getPrisma();
  const step = Math.min(5, Math.max(1, Number(body.step) || 1));

  try {
    // The row must exist before the insert: `Draft.userId` is a real foreign key, and a JWT
    // session creates no user record on its own.
    const userId = await ensureUser(user);
    const existing = await prisma.draft.findFirst({ where: { userId } });

    if (existing) {
      await prisma.draft.update({
        where: { id: existing.id },
        data: { spec: serialized, step },
      });
    } else {
      await prisma.draft.create({ data: { userId, spec: serialized, step } });
    }

    return Response.json({ ok: true });
  } catch (error) {
    // Autosave failing must never interrupt someone mid-wizard. Reported, not thrown.
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not save draft.' },
      { status: 200 },
    );
  }
}

export async function DELETE(): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureUser(user)
    .then((userId) => getPrisma().draft.deleteMany({ where: { userId } }))
    .catch(() => null);

  return Response.json({ ok: true });
}
