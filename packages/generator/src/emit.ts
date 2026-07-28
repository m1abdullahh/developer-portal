/**
 * Emit — the only function in this package that touches the filesystem.
 *
 * Kept separate from the pipeline on purpose. `runPipeline` is filesystem-free, so a failed
 * generation cannot leave a half-written directory behind; emission is an explicit, separate
 * decision made by the caller once generation has fully succeeded (doc 06 §1).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VirtualFile } from './types.js';

export interface EmitOptions {
  /** Refuse to write if the target directory already contains files. */
  requireEmpty?: boolean;
}

export interface EmitResult {
  written: number;
  outDir: string;
}

/**
 * Writes a generated tree to disk.
 *
 * Paths are re-validated against the output root rather than trusted. They were normalised at
 * insertion time, but this is the moment they become real filesystem writes, and a path that
 * escaped the root here would write outside the project.
 */
export async function emitTree(
  files: readonly VirtualFile[],
  outDir: string,
  options: EmitOptions = {},
): Promise<EmitResult> {
  const root = path.resolve(outDir);

  if (options.requireEmpty) {
    const { readdir } = await import('node:fs/promises');
    try {
      const entries = await readdir(root);
      if (entries.length > 0) {
        throw new Error(
          `Output directory "${root}" is not empty. Refusing to write over existing files.`,
        );
      }
    } catch (err) {
      // ENOENT is fine — we are about to create it.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  await mkdir(root, { recursive: true });

  for (const file of files) {
    const target = path.resolve(root, file.path);

    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(
        `Refusing to write "${file.path}" — it resolves outside the output directory.`,
      );
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
      target,
      typeof file.content === 'string' ? file.content : Buffer.from(file.content),
      file.mode === undefined ? {} : { mode: file.mode },
    );
  }

  return { written: files.length, outDir: root };
}
