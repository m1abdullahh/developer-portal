/**
 * The in-memory file tree.
 *
 * Nothing touches disk until the `emit` stage. That single constraint is what makes the merge,
 * codemod and verify stages possible at all — and it is why a failed generation leaves zero
 * side effects (doc 06 §1). Retrying a failed generation costs only CPU.
 */

import type { VirtualFile } from './types.js';

export class FileCollisionError extends Error {
  constructor(
    readonly path: string,
    readonly existingRecipe: string,
    readonly incomingRecipe: string,
  ) {
    super(
      `Two recipes both own "${path}": "${existingRecipe}" and "${incomingRecipe}". ` +
        `Shared files must be composed through a merge strategy or an AST codemod, not written twice. ` +
        `See docs/plan/05-generator-engine.md §3.`,
    );
    this.name = 'FileCollisionError';
  }
}

/**
 * Normalises a template-declared path into a canonical tree key.
 *
 * Templates are authored on both Windows and POSIX machines, so backslashes appear in `to:`
 * frontmatter in practice. Without normalisation the same file lands twice under two keys and
 * the collision check silently misses it.
 */
export function normalizePath(input: string): string {
  const unified = input.replace(/\\/g, '/');
  const segments: string[] = [];

  for (const segment of unified.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        throw new Error(`Template path escapes the project root: "${input}"`);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new Error(`Template path resolves to nothing: "${input}"`);
  }
  return segments.join('/');
}

/**
 * A mutable tree of generated files, keyed by normalised path.
 *
 * Insertion is deliberately strict: writing the same path twice is an error rather than a
 * last-write-wins overwrite. Silent overwrites are the single easiest way for a generator to
 * become impossible to debug — the output looks plausible and the cause is invisible.
 */
export class FileTree {
  readonly #files = new Map<string, VirtualFile>();

  get size(): number {
    return this.#files.size;
  }

  has(path: string): boolean {
    return this.#files.has(normalizePath(path));
  }

  get(path: string): VirtualFile | undefined {
    return this.#files.get(normalizePath(path));
  }

  /** Adds a file. Throws FileCollisionError if the path is already owned. */
  add(file: VirtualFile): void {
    const path = normalizePath(file.path);
    const existing = this.#files.get(path);
    if (existing) {
      throw new FileCollisionError(path, existing.producedBy, file.producedBy);
    }
    this.#files.set(path, { ...file, path });
  }

  /**
   * Replaces an existing file's content, keeping its original owner.
   *
   * This is the only sanctioned way to change a file after it is written, and it is what the
   * codemod and format stages use — they transform files rather than claiming ownership of them.
   */
  replace(path: string, content: string | Uint8Array): void {
    const key = normalizePath(path);
    const existing = this.#files.get(key);
    if (!existing) {
      throw new Error(`Cannot replace "${key}" — no such file in the tree.`);
    }
    this.#files.set(key, { ...existing, content });
  }

  /** Adds a file, or replaces it if a merge strategy has already claimed the path. */
  set(file: VirtualFile): void {
    const path = normalizePath(file.path);
    this.#files.set(path, { ...file, path });
  }

  delete(path: string): boolean {
    return this.#files.delete(normalizePath(path));
  }

  /**
   * All files, sorted by path.
   *
   * Sorting is not cosmetic: golden-file tests compare whole trees, so emission order has to be
   * stable across runs and across filesystems (doc 05 §6).
   */
  toArray(): VirtualFile[] {
    return [...this.#files.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
  }

  paths(): string[] {
    return this.toArray().map((f) => f.path);
  }

  /** Files whose path matches a predicate — used by the format and verify stages. */
  filter(predicate: (file: VirtualFile) => boolean): VirtualFile[] {
    return this.toArray().filter(predicate);
  }

  /** Reads a text file's content, failing loudly on a binary or missing file. */
  readText(path: string): string {
    const file = this.get(path);
    if (!file) throw new Error(`No such file in the tree: "${normalizePath(path)}"`);
    if (typeof file.content !== 'string') {
      throw new Error(`"${file.path}" is binary and cannot be read as text.`);
    }
    return file.content;
  }
}
