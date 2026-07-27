/**
 * Template renderer.
 *
 * Hygen's `.ejs.t` format, rendered in-process rather than by shelling out to the Hygen CLI.
 * The reasons are in docs/plan/05-generator-engine.md §1: the CLI writes straight to disk,
 * which makes the merge/codemod/verify stages impossible, and its errors arrive as exit codes
 * rather than typed failures we can attribute to a template and line.
 *
 * ── On escaping ──────────────────────────────────────────────────────────────
 * EJS defaults `<%= %>` to HTML escaping. That is actively wrong for code generation: a
 * description containing an apostrophe would emit `&#39;`, and `&&` in a shell script would
 * become `&amp;&amp;`. We therefore override `escape` to identity, so `<%=` and `<%-` both
 * emit raw text.
 *
 * Safety comes from the layer that can actually provide it — every value reaching a template
 * has already been validated by the ProjectSpec schema (slug regex anchored and length-capped,
 * strings bounded, enums closed). For values embedded inside a code literal, templates use
 * `h.json(...)`, which is escaping that matches the target language rather than HTML.
 *
 * This is a deliberate correction to the "escaped by default" note in doc 00 §7.
 */

import ejs from 'ejs';
import type { ProjectSpec } from '@idp/core';
import { parseFrontmatter, type Frontmatter } from './frontmatter.js';
import { h, type TemplateHelpers } from './helpers.js';
import type { VirtualFile } from './types.js';

export interface RenderContext {
  spec: ProjectSpec;
  h: TemplateHelpers;
  /** Recipe-supplied values; keeps templates free of spec-shaped conditionals. */
  [key: string]: unknown;
}

export class TemplateRenderError extends Error {
  constructor(
    readonly templatePath: string,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to render template "${templatePath}": ${detail}`);
    this.name = 'TemplateRenderError';
    this.cause = cause;
  }
}

/** Identity — see the escaping note above. */
const noEscape = (value: unknown): string => (value == null ? '' : String(value));

const EJS_OPTIONS: ejs.Options = {
  escape: noEscape,
  // Templates must be pure and self-contained: no filesystem includes, so a template can
  // never reach outside the asset root or depend on render-time ambient state.
  root: undefined,
  rmWhitespace: false,
  // Renders to a plain string rather than a compiled function cache keyed by filename —
  // the same template renders many times per run with different contexts.
  cache: false,
  // Synchronous by contract. EJS 6 types render() as `string | Promise<string>` because it
  // supports async templates; we forbid those outright — an awaiting template could perform
  // I/O, which would break both purity and determinism (doc 05 §6).
  async: false,
};

/** Synchronous render. Safe because EJS_OPTIONS pins `async: false`. */
function renderSync(source: string, data: ejs.Data): string {
  return ejs.render(source, data, EJS_OPTIONS) as string;
}

/**
 * Renders template source into a VirtualFile, or null when frontmatter says to skip it.
 *
 * The whole file — frontmatter included — is rendered in one pass before parsing, so `to:`
 * can depend on the spec. That is what lets one template emit different destinations per
 * project instead of needing a template per variant.
 */
export function renderTemplate(
  source: string,
  context: RenderContext,
  templatePath: string,
  producedBy: string,
): VirtualFile | null {
  let rendered: string;
  try {
    rendered = renderSync(source, { ...context, h });
  } catch (cause) {
    throw new TemplateRenderError(templatePath, cause);
  }

  const { frontmatter, body } = parseFrontmatter(rendered, templatePath);
  if (frontmatter.skipIf) return null;

  const file: VirtualFile = {
    path: frontmatter.to,
    content: normalizeOutput(body),
    producedBy,
  };
  if (frontmatter.mode !== undefined) file.mode = frontmatter.mode;
  return file;
}

/** Renders a bare string with no frontmatter — used by recipes composing content directly. */
export function renderString(source: string, context: RenderContext, label = '<inline>'): string {
  try {
    return renderSync(source, { ...context, h });
  } catch (cause) {
    throw new TemplateRenderError(label, cause);
  }
}

/**
 * Normalises rendered output.
 *
 * LF endings and exactly one trailing newline. Without this, output differs between Windows
 * and Linux authoring machines and every golden-file test fails on the wrong platform.
 */
export function normalizeOutput(text: string): string {
  const lf = text.replace(/\r\n/g, '\n');
  const trimmed = lf.replace(/\s+$/, '');
  return trimmed === '' ? '' : `${trimmed}\n`;
}

export type { Frontmatter };
