'use server';

import { revalidatePath } from 'next/cache';
import { getPrisma, hasRole, isLifecycle } from '@idp/db';
import { serviceHref } from '../../../../lib/service-detail';
import { ForbiddenError, requireUser } from '../../../../lib/session';

/**
 * Changes a service's lifecycle. Admin only (doc 07 §6).
 *
 * Checked here and not only in the markup that hides the form: a server action is a public
 * endpoint with a generated name, and hiding a control is a courtesy to the user, not an access
 * control.
 */
export async function setLifecycle(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasRole(user.role, 'admin')) {
    throw new ForbiddenError('Changing a service’s lifecycle requires the admin role.');
  }

  const org = String(formData.get('org') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const lifecycle = String(formData.get('lifecycle') ?? '');
  if (!isLifecycle(lifecycle)) throw new Error(`Not a lifecycle: ${lifecycle}`);

  await getPrisma().service.update({
    where: { org_slug: { org, slug } },
    data: { lifecycle },
  });

  revalidatePath(serviceHref(org, slug));
  revalidatePath('/catalog');
}
