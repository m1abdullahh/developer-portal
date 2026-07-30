/**
 * Template asset loading.
 *
 * Recipes point at a directory of `.ejs.t` files; this walks it, renders each one, and returns
 * the resulting VirtualFiles.
 *
 * ── On the filesystem-free rule ──────────────────────────────────────────────
 * The pipeline's guarantee is that a failed generation leaves no side effects, which is about
 * *writes*. Reading template assets shipped inside the package is not a side effect, and the
 * alternative — embedding hundreds of templates as string literals — would make them
 * unreadable and unlintable. Writes remain confined to the emit stage.
 *
 * Directory layout under a template root is purely organisational: the destination path comes
 * from each template's `to:` frontmatter, never from where the file sits on disk. That is what
 * lets one template emit to different places depending on the spec.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderTemplate } from './renderer.js';
import type { RecipeContext, VirtualFile } from './types.js';

/** Templates end in `.ejs.t`; anything else in the tree is copied verbatim. */
const TEMPLATE_SUFFIX = '.ejs.t';

/** Files copied byte-for-byte, bypassing EJS entirely (images, fonts, fixtures). */
const PASSTHROUGH_DIR = 'passthrough';

export class TemplateDirectoryError extends Error {
  constructor(dir: string, cause: unknown) {
    super(
      `Could not read template directory "${dir}": ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'TemplateDirectoryError';
  }
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (cause) {
    throw new TemplateDirectoryError(dir, cause);
  }

  const files: string[] = [];
  // Sorted so template discovery order is stable across filesystems — golden-file tests
  // compare whole trees, and an unstable walk would surface as phantom diffs (doc 05 §6).
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Renders every template in a directory tree.
 *
 * Templates returning `null` (their `skip_if` evaluated true) are dropped, which is how one
 * recipe emits different file sets for different specs without branching in the recipe itself.
 */
export async function loadTemplateDir(
  dir: string,
  context: RecipeContext,
  recipeId: string,
  /**
   * Extra values for the templates.
   *
   * How a recipe passes derived data — the framework contract, most usefully — without every
   * template deriving it from the spec itself. A styling template writing
   * `to: <%= framework.stylesheetPath %>` stays ignorant of which frameworks exist, which is the
   * whole point of the contract.
   */
  extra: Record<string, unknown> = {},
): Promise<VirtualFile[]> {
  const out: VirtualFile[] = [];
  // Spread into an object literal: RecipeContext is an interface and so is not directly
  // assignable to RenderContext's index signature, but a literal is.
  const renderContext = { ...context, ...extra };

  for (const filePath of await walk(dir)) {
    const relative = path.relative(dir, filePath).replace(/\\/g, '/');

    if (relative.startsWith(`${PASSTHROUGH_DIR}/`)) {
      out.push({
        path: relative.slice(PASSTHROUGH_DIR.length + 1),
        content: new Uint8Array(await readFile(filePath)),
        producedBy: recipeId,
      });
      continue;
    }

    if (!filePath.endsWith(TEMPLATE_SUFFIX)) {
      // A stray non-template file is almost always a mistake (an editor backup, a README the
      // author meant to place elsewhere). Silently emitting it would be worse than skipping.
      continue;
    }

    const source = await readFile(filePath, 'utf8');
    const rendered = renderTemplate(source, renderContext, relative, recipeId);
    if (rendered) out.push(rendered);
  }

  return out;
}
