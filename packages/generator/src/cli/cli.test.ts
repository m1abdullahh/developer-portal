import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spineSpec } from '@idp/core';
import { emitTree } from '../emit.js';
import { main } from './index.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'idp-cli-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('emitTree', () => {
  it('writes files and creates nested directories', async () => {
    const out = path.join(dir, 'proj');
    const result = await emitTree(
      [
        { path: 'README.md', content: '# hi\n', producedBy: 'r' },
        { path: 'src/deep/nested/a.ts', content: 'export const a = 1;\n', producedBy: 'r' },
      ],
      out,
    );

    expect(result.written).toBe(2);
    expect(await readFile(path.join(out, 'README.md'), 'utf8')).toBe('# hi\n');
    expect(await readFile(path.join(out, 'src/deep/nested/a.ts'), 'utf8')).toContain('const a');
  });

  it('writes binary content unchanged', async () => {
    const out = path.join(dir, 'bin');
    await emitTree([{ path: 'x.bin', content: new Uint8Array([1, 2, 3]), producedBy: 'r' }], out);
    const read = await readFile(path.join(out, 'x.bin'));
    expect([...read]).toEqual([1, 2, 3]);
  });

  // Paths were normalised at insertion, but this is where they become real writes.
  it('refuses to write outside the output directory', async () => {
    const out = path.join(dir, 'safe');
    await expect(
      emitTree([{ path: '../escaped.txt', content: 'x', producedBy: 'r' }], out),
    ).rejects.toThrow(/outside the output directory/);
  });

  it('refuses a non-empty directory when requireEmpty is set', async () => {
    const out = path.join(dir, 'occupied');
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'existing.txt'), 'x');

    await expect(
      emitTree([{ path: 'a.ts', content: 'x', producedBy: 'r' }], out, { requireEmpty: true }),
    ).rejects.toThrow(/not empty/);
  });

  it('accepts a missing directory when requireEmpty is set', async () => {
    const out = path.join(dir, 'brand-new');
    await expect(
      emitTree([{ path: 'a.ts', content: 'x\n', producedBy: 'r' }], out, { requireEmpty: true }),
    ).resolves.toMatchObject({ written: 1 });
  });
});

describe('idp validate', () => {
  it('reports a valid spec with a summary', async () => {
    const specFile = path.join(dir, 'spec.json');
    await writeFile(specFile, JSON.stringify(spineSpec()));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['validate', '--spec', specFile]);

    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Spec is valid');
    expect(output).toContain('acme-health-backend');
    expect(output).toContain('nextjs-app');
    log.mockRestore();
  });

  it('exits non-zero and lists issues for an invalid spec', async () => {
    const specFile = path.join(dir, 'bad.json');
    // tRPC on Go — rejected by the compatibility matrix (doc 00 §5.3).
    await writeFile(
      specFile,
      JSON.stringify(spineSpec({ api: { runtime: 'go-gin', paradigm: 'trpc', orm: 'gorm' } })),
    );

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exited');
    }) as never);

    await expect(main(['validate', '--spec', specFile])).rejects.toThrow('exited');
    expect(err.mock.calls.flat().join('\n')).toMatch(/tRPC requires the Node\.js/);

    err.mockRestore();
    exit.mockRestore();
  });

  it('fails clearly when the spec file does not exist', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exited');
    }) as never);

    await expect(main(['validate', '--spec', path.join(dir, 'nope.json')])).rejects.toThrow(
      'exited',
    );
    expect(err.mock.calls.flat().join('\n')).toMatch(/could not read spec/);

    err.mockRestore();
    exit.mockRestore();
  });
});

describe('idp list-recipes', () => {
  it('reports honestly that no recipes are registered yet', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['list-recipes']);
    expect(log.mock.calls.flat().join('\n')).toMatch(/No recipes are registered yet/);
    log.mockRestore();
  });
});

describe('idp usage', () => {
  it('prints usage with --help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--help']);
    expect(log.mock.calls.flat().join('\n')).toContain('idp generate --spec');
    log.mockRestore();
  });

  it('prints usage with no command', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([]);
    expect(log.mock.calls.flat().join('\n')).toContain('Usage:');
    log.mockRestore();
  });

  it('rejects an unknown command', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exited');
    }) as never);

    await expect(main(['nonsense'])).rejects.toThrow('exited');
    expect(err.mock.calls.flat().join('\n')).toMatch(/unknown command/);

    err.mockRestore();
    exit.mockRestore();
  });

  it('requires --spec and --out for generate', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exited');
    }) as never);

    await expect(main(['generate'])).rejects.toThrow('exited');
    expect(err.mock.calls.flat().join('\n')).toMatch(/requires --spec/);

    err.mockRestore();
    exit.mockRestore();
  });
});
