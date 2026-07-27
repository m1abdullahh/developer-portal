/**
 * @idp/templates — template assets.
 *
 * Assets live in `assets/` as Hygen-style `.ejs.t` files and are deliberately excluded from
 * lint, format and tsc (see .prettierignore and eslint.config.js): they contain EJS
 * interpolation and are not valid source until rendered. The *generated output* is what gets
 * linted (doc 08 §4).
 *
 * This module exposes only the asset root so the renderer can locate templates without
 * hardcoding a relative path that breaks once compiled to dist/.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the template asset root, valid from both src/ and dist/. */
export const TEMPLATE_ROOT = path.resolve(here, '..', 'assets');

/** Resolves a template path relative to the asset root. */
export function templatePath(...segments: string[]): string {
  return path.join(TEMPLATE_ROOT, ...segments);
}
