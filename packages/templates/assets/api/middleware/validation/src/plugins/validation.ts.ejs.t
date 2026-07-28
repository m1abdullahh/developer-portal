---
to: src/lib/validation-error.ts
---
import type { FastifyError, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * Uniform validation error responses.
 *
 * Fastify's default validation error is a single flattened string
 * (`body/email must match format "email"`). A client cannot map that back to a form field, so
 * every consumer ends up parsing the message with a regular expression.
 *
 * This returns a per-field structure, and uses 422 rather than 400: the request was
 * syntactically valid JSON that failed *semantic* validation. Distinguishing the two lets a
 * client tell "I sent malformed data" from "I sent well-formed but invalid data".
 *
 * Exported as a helper rather than installed via setErrorHandler — Fastify allows only one
 * error handler per scope, so this is called from the single handler in server.ts.
 *
 * The same envelope is emitted by the Python and Go runtimes, so a client behaves identically
 * whichever one a given service happens to use.
 */
export function tryHandleValidationError(error: FastifyError, reply: FastifyReply): boolean {
  if (!hasZodFastifySchemaValidationErrors(error)) return false;

  void reply.status(422).send({
    error: 'Unprocessable Entity',
    message: 'Request validation failed.',
    statusCode: 422,
    details: error.validation.map((issue) => ({
      // instancePath is the reliable source ("/email"). The nested params shape differs
      // between validator versions, so it is read defensively rather than trusted.
      field: issue.instancePath.replace(/^\//, '').replace(/\//g, '.') || 'body',
      message: issue.message ?? 'Invalid value',
    })),
  });

  return true;
}
