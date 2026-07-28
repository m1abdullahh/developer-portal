/**
 * Verify stage — the last gate before anything is written or pushed.
 *
 * Everything here has actually shipped from a generator at some point: half-rendered templates,
 * JSON that does not parse, a real credential baked into a config file. They are cheap to detect
 * and expensive to discover after a repo has been created and cloned.
 *
 * See docs/plan/05-generator-engine.md §7 (`verify`) and doc 00 §7 (security).
 */

import { parse as parseYaml } from 'yaml';
import type { FileTree } from '../tree.js';
import type { Diagnostic } from '../types.js';

/**
 * Unrendered EJS left in the output.
 *
 * Usually a typo (`<% if %>` without a close, or `<%=` inside a string the template escaped).
 * The output looks almost right, which is exactly why it needs to be mechanical to catch.
 */
function checkUnrenderedTemplates(tree: FileTree): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const file of tree.toArray()) {
    if (typeof file.content !== 'string') continue;
    // `<%%` is EJS's escape for a literal `<%`, so it is legitimate output.
    const stripped = file.content.replace(/<%%/g, '').replace(/%%>/g, '');
    const match = /<%[-=_]?|[-_]?%>/.exec(stripped);
    if (!match) continue;

    const line = stripped.slice(0, match.index).split('\n').length;
    out.push({
      severity: 'error',
      code: 'unrendered-template',
      message: `Unrendered EJS delimiter "${match[0]}" at line ${line}. The template did not fully render.`,
      file: file.path,
      recipeId: file.producedBy,
    });
  }

  return out;
}

/**
 * Files that are JSON with Comments by specification, not by accident.
 *
 * TypeScript, ESLint and VS Code all accept comments in these, and the comments are worth
 * keeping — a generated tsconfig that explains *why* a compiler option is set is far more
 * useful than a bare one. Validating them with strict JSON.parse would reject valid files.
 */
const JSONC_FILES =
  /(^|\/)(tsconfig[^/]*\.json|jsconfig\.json|\.eslintrc\.json|devcontainer\.json)$/;

/**
 * Strips `//` and comments from JSONC, ignoring delimiters inside string literals.
 *
 * A naive regex would corrupt any string containing `//` — a URL in a config value being the
 * obvious case.
 */
function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    const next = input[i + 1];

    if (inLine) {
      if (char === '\n') {
        inLine = false;
        out += char;
      }
      continue;
    }

    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (char === '\\') {
        out += input[i + 1] ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }

    out += char;
  }

  // Trailing commas are legal in JSONC and common after a comment is removed.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** JSON and YAML that does not parse — a broken package.json breaks `npm install` immediately. */
function checkParseable(tree: FileTree): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const file of tree.toArray()) {
    if (typeof file.content !== 'string' || file.content.trim() === '') continue;

    if (/\.json$/.test(file.path)) {
      const source = JSONC_FILES.test(file.path) ? stripJsonComments(file.content) : file.content;
      try {
        JSON.parse(source);
      } catch (cause) {
        out.push({
          severity: 'error',
          code: 'invalid-json',
          message: `Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
          file: file.path,
          recipeId: file.producedBy,
        });
      }
    }

    if (/\.ya?ml$/.test(file.path)) {
      try {
        parseYaml(file.content);
      } catch (cause) {
        out.push({
          severity: 'error',
          code: 'invalid-yaml',
          message: `Invalid YAML: ${cause instanceof Error ? cause.message : String(cause)}`,
          file: file.path,
          recipeId: file.producedBy,
        });
      }
    }
  }

  return out;
}

/**
 * Credential-shaped literals.
 *
 * Matched on *provider-specific prefixes* rather than entropy. An entropy heuristic flags hashes,
 * base64 fixtures and long IDs constantly, and a check people learn to ignore protects nothing.
 * Every pattern below identifies a real credential format.
 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained PAT', pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'Stripe live secret key', pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: 'Stripe live publishable key', pattern: /\bpk_live_[A-Za-z0-9]{16,}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
];

function checkNoSecrets(tree: FileTree): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const file of tree.toArray()) {
    if (typeof file.content !== 'string') continue;

    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = pattern.exec(file.content);
      if (!match) continue;

      const line = file.content.slice(0, match.index).split('\n').length;
      out.push({
        severity: 'error',
        code: 'secret-literal',
        message:
          `Possible ${name} at line ${line}. The generator must never emit a real credential — ` +
          `use an empty .env.example entry and document it in SECRETS.md instead.`,
        file: file.path,
        recipeId: file.producedBy,
      });
    }
  }

  return out;
}

/**
 * CORS wildcard combined with credentials.
 *
 * Browsers reject this combination outright, so the generated API would fail every
 * authenticated cross-origin request — with a message that points at the browser, not the config.
 */
function checkCorsSanity(tree: FileTree): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const file of tree.filter((f) => /cors/i.test(f.path))) {
    if (typeof file.content !== 'string') continue;
    const hasWildcard = /origin\s*:\s*['"`]\*['"`]/.test(file.content);
    const hasCredentials = /credentials\s*:\s*true/.test(file.content);

    if (hasWildcard && hasCredentials) {
      out.push({
        severity: 'error',
        code: 'cors-wildcard-with-credentials',
        message:
          'CORS allows any origin while also allowing credentials. Browsers reject this ' +
          'combination, so every authenticated cross-origin request would fail.',
        file: file.path,
        recipeId: file.producedBy,
      });
    }
  }

  return out;
}

/** Files every generated project must have, regardless of stack. */
const REQUIRED_FILES = ['README.md', '.gitignore'] as const;

function checkRequiredFiles(tree: FileTree): Diagnostic[] {
  return REQUIRED_FILES.filter((path) => !tree.has(path)).map((path) => ({
    severity: 'error' as const,
    code: 'missing-required-file',
    message: `Every generated project must include "${path}".`,
    file: path,
  }));
}

/** An empty file is nearly always a template that rendered to nothing by mistake. */
function checkNoEmptyFiles(tree: FileTree): Diagnostic[] {
  return tree
    .filter((f) => typeof f.content === 'string' && f.content.trim() === '')
    .map((f) => ({
      severity: 'warn' as const,
      code: 'empty-file',
      message: 'File is empty — the template may have rendered to nothing.',
      file: f.path,
      recipeId: f.producedBy,
    }));
}

export interface VerifyResult {
  diagnostics: Diagnostic[];
  ok: boolean;
}

/**
 * Runs every check and returns all findings.
 *
 * Deliberately collects rather than fails fast: showing one problem at a time turns fixing a
 * broken template into a slow guessing game.
 */
export function verifyTree(tree: FileTree): VerifyResult {
  const diagnostics = [
    ...checkUnrenderedTemplates(tree),
    ...checkParseable(tree),
    ...checkNoSecrets(tree),
    ...checkCorsSanity(tree),
    ...checkRequiredFiles(tree),
    ...checkNoEmptyFiles(tree),
  ].sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || a.code.localeCompare(b.code));

  return { diagnostics, ok: !diagnostics.some((d) => d.severity === 'error') };
}
