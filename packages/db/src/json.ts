/**
 * Typed accessors for the JSON-encoded columns.
 *
 * The schema stores specs, tags and stage records as JSON strings so the model stays portable
 * between SQLite and PostgreSQL (see the provider note in schema.prisma). Every read goes
 * through here rather than a bare JSON.parse, so a corrupt or legacy-shaped row surfaces as a
 * clear error at the boundary instead of an `undefined` three call-frames later.
 */

import { parseProjectSpec, type ProjectSpec } from '@idp/core';

export class CorruptRecordError extends Error {
  constructor(
    readonly field: string,
    readonly recordId: string,
    cause: unknown,
  ) {
    super(`Corrupt JSON in ${field} for record ${recordId}: ${String(cause)}`);
    this.name = 'CorruptRecordError';
  }
}

function parseJson<T>(raw: string, field: string, recordId: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new CorruptRecordError(field, recordId, cause);
  }
}

/** Reads and fully validates a stored ProjectSpec. */
export function readSpec(raw: string, recordId: string): ProjectSpec {
  const parsed = parseJson<unknown>(raw, 'spec', recordId);
  try {
    return parseProjectSpec(parsed);
  } catch (cause) {
    throw new CorruptRecordError('spec', recordId, cause);
  }
}

/**
 * Reads a stored spec without validating it against the current schema.
 *
 * Needed for the catalog: a spec written under an older specVersion must still be *displayable*
 * even though it no longer parses. Validation is the caller's decision.
 */
export function readSpecUnchecked(raw: string, recordId: string): unknown {
  return parseJson<unknown>(raw, 'spec', recordId);
}

export function writeSpec(spec: ProjectSpec): string {
  return JSON.stringify(spec);
}

export function readStringArray(raw: string, field: string, recordId: string): string[] {
  const parsed = parseJson<unknown>(raw, field, recordId);
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
    throw new CorruptRecordError(field, recordId, 'expected string[]');
  }
  return parsed as string[];
}

export function writeStringArray(values: readonly string[]): string {
  return JSON.stringify(values);
}

export interface StageRecord {
  stage: string;
  status: 'start' | 'done' | 'fail';
  ms?: number;
  message?: string;
}

export function readStages(raw: string, recordId: string): StageRecord[] {
  const parsed = parseJson<unknown>(raw, 'stages', recordId);
  if (!Array.isArray(parsed)) throw new CorruptRecordError('stages', recordId, 'expected array');
  return parsed as StageRecord[];
}

export function writeStages(stages: readonly StageRecord[]): string {
  return JSON.stringify(stages);
}
