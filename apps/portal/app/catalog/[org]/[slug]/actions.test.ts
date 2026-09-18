import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Db from '@idp/db';

/**
 * The lifecycle action's access control.
 *
 * The browser suite signs in as an admin, so it can only ever show that the action works. What
 * matters more is who it refuses: a server action is a public endpoint whatever the page chooses
 * to render, so the refusal is asserted here, against the action itself, with the database
 * watched to prove nothing was written.
 */
const update = vi.fn();
const requireUser = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@idp/db', async (original) => ({
  ...(await original<typeof Db>()),
  getPrisma: () => ({ service: { update } }),
}));
vi.mock('../../../../lib/session', () => {
  class ForbiddenError extends Error {}
  class UnauthorizedError extends Error {}
  return { ForbiddenError, UnauthorizedError, requireUser: () => requireUser() };
});

const { setLifecycle } = await import('./actions');

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const request = { org: 'acme', slug: 'shop-web', lifecycle: 'PRODUCTION' };

beforeEach(() => {
  update.mockReset();
  requireUser.mockReset();
});

describe('setLifecycle', () => {
  it('writes the lifecycle for an admin', async () => {
    requireUser.mockResolvedValue({ login: 'root', role: 'admin' });
    await setLifecycle(form(request));
    expect(update).toHaveBeenCalledWith({
      where: { org_slug: { org: 'acme', slug: 'shop-web' } },
      data: { lifecycle: 'PRODUCTION' },
    });
  });

  it.each(['viewer', 'provisioner'])('refuses a %s, and writes nothing', async (role) => {
    requireUser.mockResolvedValue({ login: 'someone', role });
    await expect(setLifecycle(form(request))).rejects.toThrow(/admin role/);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses someone who is not signed in, and writes nothing', async () => {
    requireUser.mockRejectedValue(new Error('Sign in required.'));
    await expect(setLifecycle(form(request))).rejects.toThrow('Sign in required.');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a lifecycle, even from an admin', async () => {
    requireUser.mockResolvedValue({ login: 'root', role: 'admin' });
    await expect(setLifecycle(form({ ...request, lifecycle: 'RETIRED' }))).rejects.toThrow(
      /Not a lifecycle/,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
