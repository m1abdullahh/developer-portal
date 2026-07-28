/**
 * Live availability check for the technical ID.
 *
 * Two independent questions, answered in order: is the slug *legal* (format, reserved words,
 * Windows device names), and is it *free* (not already a repository, not already a catalog
 * entry). A legal-but-taken name and an illegal name need different messages.
 *
 * `unknown` is never collapsed into `available`. A failed GitHub lookup reported as free is how
 * two people race into the same repository name (doc 01 §1.2).
 */

import { validateSlug } from '@idp/core';
import { getPrisma } from '@idp/db';
import { authErrorResponse, requireUser } from '../../../lib/session';
import { selectVcsDriver } from '../../../lib/provisioning';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') ?? '';
  const org = url.searchParams.get('org') ?? '';

  const validation = validateSlug(slug);
  if (!validation.valid) {
    return Response.json({ status: 'taken', reason: validation.message });
  }

  if (!org) {
    return Response.json({ status: 'unknown', reason: 'Choose an organisation first.' });
  }

  // The catalog is checked first because it is local, authoritative for anything this portal
  // created, and cannot rate-limit us.
  const existing = await getPrisma()
    .service.findUnique({ where: { org_slug: { org, slug } } })
    .catch(() => null);

  if (existing) {
    return Response.json({
      status: 'taken',
      reason: 'A service with this ID already exists in the catalog.',
    });
  }

  try {
    const availability = await selectVcsDriver().checkAvailability(org, slug);
    return Response.json({
      status: availability.status,
      ...(availability.reason ? { reason: availability.reason } : {}),
    });
  } catch (error) {
    return Response.json({
      status: 'unknown',
      reason: error instanceof Error ? error.message : 'Could not reach the repository provider.',
    });
  }
}
