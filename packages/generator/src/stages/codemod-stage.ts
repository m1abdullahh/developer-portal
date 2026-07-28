/**
 * Codemod stage dispatcher.
 *
 * Recipes declare codemods as data (`CodemodOp`), not as functions, so a plan can be inspected,
 * logged and diffed before anything is applied — and so the CLI can answer "what would this
 * spec change?" without running it.
 *
 * Operations are BATCHED PER FILE. Provider wraps and marker insertions both need to see every
 * contribution at once in order to sort them; applying them one at a time would make the result
 * depend on recipe order, which is exactly what the priority tables exist to prevent.
 */

import { insertAtMarkers, syntaxForPath, type MarkerInsertion } from '../codemod/markers.js';
import type { ProviderWrap } from '../codemod/providers.js';
import {
  addImport,
  addObjectProperty,
  addToArray,
  applyTsCodemods,
  wrapJsxChildren,
  type ImportSpec,
  type TsCodemod,
} from '../codemod/ts-ops.js';
import type { FileTree } from '../tree.js';
import type { CodemodOp, Diagnostic } from '../types.js';

export const CODEMOD_KINDS = [
  'wrapProvider',
  'addImport',
  'addToArray',
  'addObjectProperty',
  'insertAtMarker',
] as const;

export type CodemodKind = (typeof CODEMOD_KINDS)[number];

export interface CodemodStageResult {
  applied: number;
  diagnostics: Diagnostic[];
}

interface FileOps {
  providers: ProviderWrap[];
  imports: ImportSpec[];
  arrays: Array<{ path: string; values: string[] }>;
  properties: Array<{ object: string; key: string; value: string }>;
  markers: MarkerInsertion[];
}

function emptyOps(): FileOps {
  return { providers: [], imports: [], arrays: [], properties: [], markers: [] };
}

export function applyCodemods(tree: FileTree, ops: readonly CodemodOp[]): CodemodStageResult {
  const diagnostics: Diagnostic[] = [];
  const byFile = new Map<string, FileOps>();

  for (const op of ops) {
    if (!tree.has(op.file)) {
      // A codemod targeting a file no recipe produced means the recipe set is inconsistent —
      // usually a `requires` that should have been declared.
      diagnostics.push({
        severity: 'error',
        code: 'codemod-target-missing',
        message:
          `Codemod "${op.kind}" targets "${op.file}", which no recipe produced. ` +
          `The contributing recipe probably needs a \`requires\` on the recipe that owns it.`,
        file: op.file,
      });
      continue;
    }

    const entry = byFile.get(op.file) ?? emptyOps();

    switch (op.kind as CodemodKind) {
      case 'wrapProvider':
        entry.providers.push(op.args as unknown as ProviderWrap);
        break;
      case 'addImport':
        entry.imports.push(op.args as unknown as ImportSpec);
        break;
      case 'addToArray':
        entry.arrays.push(op.args as unknown as { path: string; values: string[] });
        break;
      case 'addObjectProperty':
        entry.properties.push(op.args as unknown as { object: string; key: string; value: string });
        break;
      case 'insertAtMarker':
        entry.markers.push(op.args as unknown as MarkerInsertion);
        break;
      default:
        diagnostics.push({
          severity: 'error',
          code: 'codemod-unknown-kind',
          message: `Unknown codemod kind "${op.kind}". Supported: ${CODEMOD_KINDS.join(', ')}.`,
          file: op.file,
        });
    }

    byFile.set(op.file, entry);
  }

  let applied = 0;

  // File order is sorted so a failure surfaces at the same place on every run.
  for (const [path, fileOps] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      let content = tree.readText(path);

      if (fileOps.markers.length > 0) {
        content = insertAtMarkers(path, content, syntaxForPath(path), fileOps.markers);
      }

      const tsOps: TsCodemod[] = [];
      if (fileOps.providers.length > 0) {
        tsOps.push((s) => wrapJsxChildren(s, fileOps.providers));
      }
      for (const spec of fileOps.imports) {
        tsOps.push((s) => addImport(s, spec));
      }
      for (const { path: arrayPath, values } of fileOps.arrays) {
        tsOps.push((s) => addToArray(s, arrayPath, values));
      }
      for (const { object, key, value } of fileOps.properties) {
        tsOps.push((s) => addObjectProperty(s, object, key, value));
      }

      if (tsOps.length > 0 && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
        content = applyTsCodemods(path, content, tsOps);
      }

      tree.replace(path, content);
      applied +=
        fileOps.markers.length +
        fileOps.providers.length +
        fileOps.imports.length +
        fileOps.arrays.length +
        fileOps.properties.length;
    } catch (cause) {
      diagnostics.push({
        severity: 'error',
        code: 'codemod-failed',
        message: cause instanceof Error ? cause.message : String(cause),
        file: path,
      });
    }
  }

  return { applied, diagnostics };
}
