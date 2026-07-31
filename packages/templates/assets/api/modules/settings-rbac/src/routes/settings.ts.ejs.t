---
to: src/routes/settings.ts
---
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { effectiveMatrix, saveMatrix } from '../lib/access.js';
import { generateApiKey } from '../lib/api-keys.js';
import { prisma } from '../lib/prisma.js';
import type { Permission, Role } from '../lib/permissions.js';
import { commonResponses, errorSchema, paginatedSchema } from '../schemas/common.js';
import {
  apiKeySchema,
  auditLogQuerySchema,
  auditLogSchema,
  createApiKeySchema,
  createdApiKeySchema,
  idParamSchema,
  orgSettingsSchema,
  permissionMatrixSchema,
  saveMatrixSchema,
  updateOrgSettingsSchema,
} from '../schemas/settings.js';

/**
 * Organisation settings, the permission matrix, the audit log and API keys.
 *
 * ── The lockout guard ───────────────────────────────────────────────────────
 * Saving a matrix that leaves no role holding `manage:settings` is refused. Without it a single
 * careless save makes this very endpoint unreachable, and the only way back is a database client.
 * It is the same shape of invariant as the last-owner rule in the users API, and it exists for the
 * same reason: an ordinary action should not be able to make the system unadministrable.
 *
 * ── The audit log is append-only ────────────────────────────────────────────
 * There is deliberately no update or delete route. A log an administrator can edit is not evidence
 * of anything, and the first thing worth erasing is the entry recording the erasure.
 *
 * ── Every route is guarded, including the reads ─────────────────────────────
 * `manage:settings` on all eight. The reads matter as much as the writes here: the audit log names
 * who did what and when, and the API key list names every integration this service trusts. Both
 * are reconnaissance for anyone who should not have them.
 *
 * The decorator comes from the JWT plugin, which this module's wizard gate guarantees is enabled —
 * `settingsRbac` is unavailable without authentication middleware.
 */
export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  const route = app.withTypeProvider<ZodTypeProvider>();
  const conflict = { 409: errorSchema.describe('Conflicts with the current state') };

  route.get(
    '/settings',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'Organisation settings',
        response: { 200: orgSettingsSchema, ...commonResponses },
      },
    },
    async () => currentSettings(),
  );

  route.patch(
    '/settings',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'Update organisation settings',
        body: updateOrgSettingsSchema,
        response: { 200: orgSettingsSchema, ...commonResponses },
      },
    },
    async (request) => {
      const before = await currentSettings();
      const body = request.body;

      const updated = await prisma.orgSettings.update({
        where: { id: before.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.allowedEmailDomain !== undefined
            ? { allowedEmailDomain: body.allowedEmailDomain || null }
            : {}),
          ...(body.defaultRole !== undefined ? { defaultRole: body.defaultRole as Role } : {}),
          ...(body.requireApproval !== undefined ? { requireApproval: body.requireApproval } : {}),
        },
      });

      await record(request, 'settings.updated', before.id, describeChange(before, updated));
      return updated;
    },
  );

  route.get(
    '/settings/permissions',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'The effective permission matrix',
        response: { 200: permissionMatrixSchema, ...commonResponses },
      },
    },
    async () => ({ entries: effectiveMatrix() }),
  );

  route.put(
    '/settings/permissions',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'Replace the permission matrix',
        body: saveMatrixSchema,
        response: { 200: permissionMatrixSchema, ...conflict, ...commonResponses },
      },
    },
    async (request, reply) => {
      const entries = request.body.entries as Array<{
        role: Role;
        permission: Permission;
        allowed: boolean;
      }>;

      // Checked against the submitted grid, not the stored one: the question is whether the state
      // being saved is administrable, and answering it afterwards is too late.
      const retainsAdmin = entries.some(
        (entry) => entry.permission === 'manage:settings' && entry.allowed,
      );

      if (!retainsAdmin) {
        return reply.status(409).send({
          error: 'Conflict',
          message:
            'That matrix leaves no role able to manage settings, which would make this page ' +
            'unreachable. Grant "manage:settings" to at least one role.',
          statusCode: 409,
        });
      }

      await saveMatrix(entries);
      await record(request, 'permissions.updated', null, `${entries.length} entries`);

      return { entries: effectiveMatrix() };
    },
  );

  route.get(
    '/audit-logs',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'Audit log, newest first',
        querystring: auditLogQuerySchema,
        response: { 200: paginatedSchema(auditLogSchema), ...commonResponses },
      },
    },
    async (request) => {
      const { cursor, limit, action, actorId } = request.query;

      const rows = await prisma.auditLog.findMany({
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        where: {
          ...(action ? { action } : {}),
          ...(actorId ? { actorId } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const page = rows.slice(0, limit);
      return { data: page, nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
    },
  );

  route.get(
    '/api-keys',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'API keys — prefixes only, never the keys themselves',
        response: { 200: z.object({ data: z.array(apiKeySchema) }), ...commonResponses },
      },
    },
    async () => ({
      data: await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } }),
    }),
  );

  route.post(
    '/api-keys',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'Create an API key',
        body: createApiKeySchema,
        response: { 201: createdApiKeySchema, ...commonResponses },
      },
    },
    async (request, reply) => {
      const { plaintext, hash, prefix } = generateApiKey();
      const { name, expiresInDays } = request.body;

      const created = await prisma.apiKey.create({
        data: {
          name,
          prefix,
          hash,
          expiresAt: expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      // The prefix, never the key. An audit log that records the credential is a second place the
      // credential lives, and log storage is rarely as guarded as a database.
      await record(request, 'api-key.created', created.id, `${prefix}…`);

      // The one and only time the plaintext leaves this process.
      return reply.status(201).send({ ...created, plaintext });
    },
  );

  route.delete(
    '/api-keys/:id',
    {
      preHandler: app.requirePermission('manage:settings'),
      schema: {
        tags: ['settings'],
        summary: 'Revoke an API key',
        params: idParamSchema,
        response: { 200: apiKeySchema, ...commonResponses },
      },
    },
    async (request, reply) => {
      const existing = await prisma.apiKey.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'No such key.', statusCode: 404 });
      }

      // Revoked, not deleted. The audit log references it, and a dangling id in an audit trail is
      // worse than a row nobody can authenticate with.
      const revoked = await prisma.apiKey.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

      await record(request, 'api-key.revoked', revoked.id, `${revoked.prefix}…`);
      return revoked;
    },
  );
}

/**
 * The settings row, created on first read.
 *
 * Lazily rather than in a migration seed: a seed runs once per environment and is easy to skip,
 * and the failure mode — every settings request 404s on a fresh database — looks like a bug in
 * this route rather than a missing fixture.
 */
async function currentSettings() {
  const existing = await prisma.orgSettings.findFirst();
  if (existing) return existing;

  return prisma.orgSettings.create({
    data: { name: '<%= spec.meta.projectName %>', defaultRole: 'viewer', requireApproval: true },
  });
}

/**
 * Appends to the audit log.
 *
 * Failures are swallowed on purpose. An audit write that fails must not roll back the action it
 * describes: refusing to save a settings change because logging was briefly unavailable is a worse
 * outcome than a gap in the log, and the gap is visible.
 */
async function record(
  request: FastifyRequest,
  action: string,
  target: string | null,
  detail: string | null,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        // The JWT subject. There is no email in the token payload, and inventing a lookup here
        // would tie the audit log to a User model this module does not require.
        actorId: request.user?.sub ?? 'system',
        action,
        target,
        detail,
      },
    });
  } catch (error) {
    request.log.warn({ err: error, action }, 'audit log write failed');
  }
}

/** A short human-readable diff for the log, rather than a JSON blob nobody reads. */
function describeChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string | null {
  const changed = Object.keys(after).filter(
    (k) => k !== 'updatedAt' && String(before[k]) !== String(after[k]),
  );
  return changed.length > 0 ? changed.join(', ') : null;
}
