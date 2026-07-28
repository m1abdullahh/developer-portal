/**
 * TypeScript / JSX codemods, via ts-morph.
 *
 * These exist for the files no single recipe owns. `app/layout.tsx` is written by the framework
 * recipe, but the state, styling and auth recipes all need to modify it. Templating that would
 * mean the framework recipe knowing about every possible feature — the exact coupling the recipe
 * model is meant to remove.
 *
 * Every operation here is IDEMPOTENT. Applying the same set twice must produce identical output;
 * there is a test that asserts precisely that. Without it, a retried or resumed generation
 * silently doubles imports and nests providers twice.
 *
 * Regex was not an option: `addImport` has to merge into an existing declaration, and
 * `wrapJsxChildren` has to find `{children}` regardless of surrounding formatting.
 */

import { Project, SyntaxKind, type SourceFile } from 'ts-morph';
import type { ProviderWrap } from './providers.js';

export class CodemodError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(`Codemod failed on "${file}": ${message}`);
    this.name = 'CodemodError';
  }
}

/** Creates an isolated in-memory project. No disk access, so codemods stay pure. */
function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: 4 /* ts.JsxEmit.ReactJSX */, allowJs: true },
  });
}

export interface ImportSpec {
  module: string;
  named?: string[];
  defaultImport?: string;
  /** `import type { X }` rather than a value import. */
  typeOnly?: boolean;
}

/**
 * Adds an import, merging into an existing declaration for the same module.
 *
 * Idempotent: re-adding a name already imported is a no-op, so the file never accumulates
 * `import { X, X, X }` across repeated applications.
 */
export function addImport(source: SourceFile, spec: ImportSpec): void {
  const existing = source
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === spec.module);

  if (!existing) {
    source.addImportDeclaration({
      moduleSpecifier: spec.module,
      ...(spec.defaultImport ? { defaultImport: spec.defaultImport } : {}),
      ...(spec.named?.length ? { namedImports: [...spec.named] } : {}),
      ...(spec.typeOnly ? { isTypeOnly: true } : {}),
    });
    return;
  }

  if (spec.defaultImport && !existing.getDefaultImport()) {
    existing.setDefaultImport(spec.defaultImport);
  }

  const already = new Set(existing.getNamedImports().map((n) => n.getName()));
  for (const name of spec.named ?? []) {
    if (!already.has(name)) existing.addNamedImport(name);
  }

  // A type-only declaration that now needs a value import must be widened, or the emitted
  // code imports a type where a runtime value is required.
  if (!spec.typeOnly && existing.isTypeOnly()) {
    existing.setIsTypeOnly(false);
  }
}

/** Finds the `{children}` JSX expression, ignoring whitespace differences. */
function findChildrenExpression(source: SourceFile) {
  return source
    .getDescendantsOfKind(SyntaxKind.JsxExpression)
    .find((e) => e.getText().replace(/\s+/g, '') === '{children}');
}

/**
 * Wraps `{children}` in a set of providers, ordered by priority.
 *
 * All wraps are applied in ONE pass rather than one at a time. Sequential wrapping would make
 * the result depend on application order, and ordering is exactly what we need to control.
 *
 * Idempotent: any provider already present in the file is skipped, so re-running never
 * double-nests.
 */
export function wrapJsxChildren(source: SourceFile, wraps: readonly ProviderWrap[]): void {
  if (wraps.length === 0) return;

  const fileText = source.getFullText();
  const fresh = wraps.filter((w) => !new RegExp(`<${w.component}[\\s/>]`).test(fileText));
  if (fresh.length === 0) return;

  const expression = findChildrenExpression(source);
  if (!expression) {
    throw new CodemodError(
      source.getFilePath(),
      'No `{children}` expression found. A layout that receives providers must render {children} ' +
        'exactly once.',
    );
  }

  // Outermost first; ties broken by component name so output is deterministic.
  const ordered = [...fresh].sort(
    (a, b) => a.priority - b.priority || a.component.localeCompare(b.component),
  );

  let jsx = '{children}';
  for (const wrap of [...ordered].reverse()) {
    const open = wrap.props ? `<${wrap.component} ${wrap.props}>` : `<${wrap.component}>`;
    jsx = `${open}${jsx}</${wrap.component}>`;
  }

  expression.replaceWithText(jsx);

  for (const wrap of ordered) {
    addImport(source, wrap.import);
  }

  // Preambles (e.g. `const queryClient = new QueryClient()`) go after the imports, before the
  // component, and only if not already present.
  const preambles = ordered.flatMap((w) => w.preamble ?? []);
  if (preambles.length > 0) {
    const text = source.getFullText();
    const missing = preambles.filter((p) => !text.includes(p.trim()));
    if (missing.length > 0) {
      const lastImport = source.getImportDeclarations().at(-1);
      const index = lastImport ? lastImport.getChildIndex() + 1 : 0;
      source.insertStatements(index, ['', ...missing]);
    }
  }
}

/**
 * Appends values to an array literal reached by a dotted path, e.g. `plugins` or
 * `compilerOptions.lib`. Values already present are skipped.
 */
export function addToArray(source: SourceFile, propertyPath: string, values: string[]): void {
  const segments = propertyPath.split('.');
  const last = segments.at(-1)!;

  const assignment = source
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .find((p) => p.getName().replace(/['"]/g, '') === last);

  if (!assignment) {
    throw new CodemodError(source.getFilePath(), `No property "${propertyPath}" found.`);
  }

  const array = assignment.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!array) {
    throw new CodemodError(source.getFilePath(), `Property "${propertyPath}" is not an array.`);
  }

  const present = new Set(array.getElements().map((e) => e.getText().replace(/\s+/g, '')));
  for (const value of values) {
    if (!present.has(value.replace(/\s+/g, ''))) array.addElement(value);
  }
}

/** Sets a property on an object literal reached by name, adding it if absent. */
export function addObjectProperty(
  source: SourceFile,
  objectName: string,
  key: string,
  value: string,
): void {
  const declaration = source.getVariableDeclaration(objectName);
  const object = declaration?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);

  if (!object) {
    throw new CodemodError(
      source.getFilePath(),
      `No object literal named "${objectName}" found to set "${key}" on.`,
    );
  }

  const existing = object.getProperty(key);
  if (existing) {
    existing.replaceWithText(`${key}: ${value}`);
    return;
  }
  object.addPropertyAssignment({ name: key, initializer: value });
}

export interface TsCodemod {
  (source: SourceFile): void;
}

/**
 * Runs codemods against file content and returns the result.
 *
 * Takes and returns strings so the caller never has to manage a ts-morph Project — the file
 * tree stays the single source of truth.
 */
export function applyTsCodemods(
  filePath: string,
  content: string,
  codemods: readonly TsCodemod[],
): string {
  if (codemods.length === 0) return content;

  const project = createProject();
  const source = project.createSourceFile(filePath, content, { overwrite: true });

  for (const codemod of codemods) {
    codemod(source);
  }

  source.formatText({ indentSize: 2 });
  return source.getFullText();
}
