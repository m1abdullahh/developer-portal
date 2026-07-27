import { describe, expect, it } from 'vitest';
import { spineSpec } from '@idp/core';
import {
  CorruptRecordError,
  readSpec,
  readSpecUnchecked,
  readStages,
  readStringArray,
  writeSpec,
  writeStages,
  writeStringArray,
} from './json.js';
import { hasRole, isJobStatus, isLifecycle, isTerminal } from './enums.js';

describe('spec round-trip', () => {
  it('survives write -> read unchanged', () => {
    const spec = spineSpec();
    expect(readSpec(writeSpec(spec), 'svc_1')).toEqual(spec);
  });

  it('raises CorruptRecordError on malformed JSON, naming the field and record', () => {
    try {
      readSpec('{not json', 'svc_42');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CorruptRecordError);
      expect((err as CorruptRecordError).field).toBe('spec');
      expect((err as CorruptRecordError).recordId).toBe('svc_42');
    }
  });

  it('raises on JSON that parses but is not a valid spec', () => {
    expect(() => readSpec('{"specVersion":1}', 'svc_1')).toThrow(CorruptRecordError);
  });

  it('readSpecUnchecked returns legacy-shaped specs the catalog must still display', () => {
    const legacy = readSpecUnchecked('{"specVersion":0,"meta":{}}', 'svc_1');
    expect(legacy).toEqual({ specVersion: 0, meta: {} });
  });
});

describe('string arrays', () => {
  it('round-trips', () => {
    expect(readStringArray(writeStringArray(['a', 'b']), 'tags', 'svc_1')).toEqual(['a', 'b']);
  });

  it('defaults cleanly from an empty column', () => {
    expect(readStringArray('[]', 'tags', 'svc_1')).toEqual([]);
  });

  it('rejects a non-string array rather than passing it through', () => {
    expect(() => readStringArray('[1,2]', 'tags', 'svc_1')).toThrow(CorruptRecordError);
    expect(() => readStringArray('{"a":1}', 'tags', 'svc_1')).toThrow(CorruptRecordError);
  });
});

describe('stage records', () => {
  it('round-trips with timings', () => {
    const stages = [
      { stage: 'render', status: 'done' as const, ms: 412 },
      { stage: 'merge', status: 'done' as const, ms: 88 },
    ];
    expect(readStages(writeStages(stages), 'job_1')).toEqual(stages);
  });
});

describe('status enums', () => {
  it('recognises valid values and rejects typos', () => {
    expect(isJobStatus('completed_with_warnings')).toBe(true);
    expect(isJobStatus('complete')).toBe(false);
    expect(isLifecycle('PRODUCTION')).toBe(true);
    expect(isLifecycle('production')).toBe(false);
  });

  it('treats all three completion states as terminal', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('completed_with_warnings')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('pushing')).toBe(false);
  });
});

describe('role hierarchy', () => {
  it('grants higher roles the privileges of lower ones', () => {
    expect(hasRole('admin', 'viewer')).toBe(true);
    expect(hasRole('provisioner', 'provisioner')).toBe(true);
    expect(hasRole('viewer', 'provisioner')).toBe(false);
    expect(hasRole('provisioner', 'admin')).toBe(false);
  });
});
