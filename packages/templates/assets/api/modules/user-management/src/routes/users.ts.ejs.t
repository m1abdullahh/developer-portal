---
to: src/routes/users.ts
---
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { commonResponses, errorSchema, paginatedSchema } from '../schemas/common.js';
import {
  inviteUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
  userSchema,
} from '../schemas/user.js';

/**
 * User management.
 *
 * ── The last-owner invariant ────────────────────────────────────────────────
 * Every mutation that could remove the final owner refuses. Without it an organisation can lock
 * itself out permanently through an ordinary-looking action — an admin demoting the one owner, or
 * an owner deleting their own account — and recovery then needs direct database access.
 *
 * The check runs inside a transaction because counting and then writing as two separate queries
 * is a race: two concurrent demotions each see two owners, and both succeed.
 *
 * ── Cursor pagination ───────────────────────────────────────────────────────
 * `cursor` is the id of the last row of the previous page, not an offset. Offsets skip or repeat
 * rows whenever the underlying set changes between requests, which for a user list is constantly.
 */
export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  const route = app.withTypeProvider<ZodTypeProvider>();

  // 409 is not in `commonResponses` because most routes cannot conflict. Both routes here can,
  // and an undocumented status is one a generated client will not handle.
  const conflict = { 409: errorSchema.describe('Conflicts with the current state') };

  route.get(
    '/users',
    {
      schema: {
        tags: ['users'],
        summary: 'List users',
        querystring: listUsersQuerySchema,
        response: { 200: paginatedSchema(userSchema), ...commonResponses },
      },
    },
    async (request) => {
      const { cursor, limit, role, status, q } = request.query;

      const rows = await prisma.user.findMany({
        // One more row than asked for. Its presence is what tells us another page exists, without
        // a second COUNT query across the whole table.
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        where: {
          ...(role ? { role } : {}),
          ...(status ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { email: { contains: q, mode: 'insensitive' as const } },
                  { name: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        // Ties on createdAt would make the cursor ambiguous and silently drop rows, so id breaks
        // them. Both columns are ordered for that reason, not for presentation.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const page = rows.slice(0, limit);
      return {
        data: page,
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  );

  route.post(
    '/users',
    {
      schema: {
        tags: ['users'],
        summary: 'Invite a user',
        body: inviteUserSchema,
        response: { 201: userSchema, ...conflict, ...commonResponses },
      },
    },
    async (request, reply) => {
      const existing = await prisma.user.findUnique({ where: { email: request.body.email } });
      if (existing) {
        // 409, not 400: the request is well-formed and would be valid at another moment. A client
        // can act on that distinction; it cannot act on "bad request".
        return reply.status(409).send({
          error: 'Conflict',
          message: 'That email address already has an account.',
          statusCode: 409,
        });
      }

      const user = await prisma.user.create({
        data: {
          email: request.body.email,
          name: request.body.name ?? null,
          role: request.body.role,
          // INVITED, not ACTIVE. The account exists but nobody has proved they control the
          // address yet, and treating an invitation as active is how someone who guesses an
          // address inherits its permissions.
          status: 'INVITED',
        },
      });

      // Sending the invitation email is deliberately absent: it needs a mail provider this
      // generator cannot choose for you. This is the place to add it.
      return reply.status(201).send(user);
    },
  );

  route.get(
    '/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Fetch one user',
        params: userIdParamSchema,
        response: { 200: userSchema, ...commonResponses },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.params.id } });
      if (!user) return notFound(reply);
      return user;
    },
  );

  route.patch(
    '/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Update a user’s name, role or status',
        params: userIdParamSchema,
        body: updateUserSchema,
        response: { 200: userSchema, ...conflict, ...commonResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      // Both branches strip an owner of the ability to act, so both count as losing an owner.
      const losesOwner =
        (body.role !== undefined && body.role !== 'owner') ||
        (body.status !== undefined && body.status !== 'ACTIVE');

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const current = await tx.user.findUnique({ where: { id } });
          if (!current) return null;

          if (current.role === 'owner' && losesOwner) await assertAnotherOwnerExists(tx, id);

          return tx.user.update({
            where: { id },
            data: {
              ...(body.name !== undefined ? { name: body.name } : {}),
              ...(body.role !== undefined ? { role: body.role } : {}),
              ...(body.status !== undefined ? { status: body.status } : {}),
            },
          });
        });

        if (!updated) return notFound(reply);
        return updated;
      } catch (error) {
        if (error instanceof LastOwnerError) return lastOwner(reply);
        throw error;
      }
    },
  );

  route.delete(
    '/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Delete a user',
        params: userIdParamSchema,
        // Fastify strips the body of a 204 before serialisation, so this schema documents the
        // absence rather than describing something that gets sent.
        response: { 204: z.null(), ...conflict, ...commonResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      try {
        const deleted = await prisma.$transaction(async (tx) => {
          const current = await tx.user.findUnique({ where: { id } });
          if (!current) return false;

          if (current.role === 'owner') await assertAnotherOwnerExists(tx, id);

          await tx.user.delete({ where: { id } });
          return true;
        });

        if (!deleted) return notFound(reply);
        // `send(null)`, not `send()`. The Zod type provider derives the payload type from the
        // 204 schema, so the argument is required even though Fastify strips the body before it
        // reaches the wire.
        return reply.status(204).send(null);
      } catch (error) {
        if (error instanceof LastOwnerError) return lastOwner(reply);
        throw error;
      }
    },
  );
}

/**
 * Thrown inside the transaction, caught outside it.
 *
 * Returning a reply from within `$transaction` would commit the transaction and then answer,
 * which is backwards — the write has to be rolled back, and throwing is what aborts it.
 */
class LastOwnerError extends Error {}

async function assertAnotherOwnerExists(
  tx: Prisma.TransactionClient,
  excludingId: string,
): Promise<void> {
  // ACTIVE only. A suspended or still-invited owner cannot sign in, so counting them would let
  // the organisation reach a state where every owner is locked out.
  const others = await tx.user.count({
    where: { role: 'owner', status: 'ACTIVE', id: { not: excludingId } },
  });
  if (others === 0) throw new LastOwnerError();
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: 'Not Found', message: 'No such user.', statusCode: 404 });
}

function lastOwner(reply: FastifyReply) {
  return reply.status(409).send({
    error: 'Conflict',
    message:
      'This is the last active owner. Promote another owner first, or the organisation would be ' +
      'left with nobody able to manage it.',
    statusCode: 409,
  });
}
