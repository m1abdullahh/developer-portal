/**
 * Format stage.
 *
 * Templates are written for readability of the *template*, not of the output — conditionals and
 * loops leave ragged indentation and stray blank lines behind. Rather than contorting every
 * template to emit perfect whitespace, we format the result.
 *
 * This is also a free syntax check: Prettier cannot parse code that does not parse, so a
 * template that produces broken output is caught here rather than in the user's editor.
 * Failures become diagnostics instead of exceptions, so one bad file does not hide the other
 * nineteen.
 */

import * as prettier from 'prettier';
import type { FileTree } from '../tree.js';
import type { Diagnostic } from '../types.js';

/** Matches the Prettier config we ship to generated projects. */
const PRETTIER_OPTIONS: prettier.Options = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf',
};

/**
 * Extensions Prettier owns. Anything else (Python, Go, Dockerfile, .env) is left alone —
 * those have their own formatters, which run inside the generated project's own tooling.
 *
 * `.vue` was missing until the first Vue page module shipped. Prettier handles single-file
 * components natively, so those files were the only thing this generator emitted unformatted —
 * and the symptom was 125 layout warnings in a freshly generated project: code that was correct
 * and looked unmaintained.
 */
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|scss|md|ya?ml|html|vue)$/;

/**
 * Files Prettier must not touch even though their extension suggests it can.
 *
 * Helm chart templates are Go templates that only become YAML after `helm template` renders
 * them — `{{- if .Values.x }}` is a YAML parse error until then. Formatting them fails, and
 * more importantly Prettier would reflow the Go directives if it ever succeeded. They are
 * validated in the generated repo's CI by `helm template` + kubeconform instead (doc 04 §7).
 */
const FORMAT_EXEMPT = /(^|\/)deploy\/templates\//;

export interface FormatResult {
  formatted: number;
  diagnostics: Diagnostic[];
}

export async function formatTree(tree: FileTree): Promise<FormatResult> {
  const diagnostics: Diagnostic[] = [];
  let formatted = 0;

  for (const file of tree.filter((f) => FORMATTABLE.test(f.path) && !FORMAT_EXEMPT.test(f.path))) {
    if (typeof file.content !== 'string') continue;

    try {
      const output = await prettier.format(file.content, {
        ...PRETTIER_OPTIONS,
        filepath: file.path,
      });
      if (output !== file.content) {
        tree.replace(file.path, output);
      }
      formatted++;
    } catch (cause) {
      // A parse failure means the template emitted syntactically invalid code. That is a
      // template bug, and it must fail the job — but report every occurrence, not just the first.
      diagnostics.push({
        severity: 'error',
        code: 'format-parse-failed',
        message:
          `Generated file could not be parsed: ${cause instanceof Error ? cause.message : String(cause)}. ` +
          `This means the template emitted invalid syntax.`,
        file: file.path,
        recipeId: file.producedBy,
      });
    }
  }

  return { formatted, diagnostics };
}
