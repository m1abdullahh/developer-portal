/**
 * Marker-anchor injection.
 *
 * Used for Python and Go (no mature Node-side AST writer exists for either), and deliberately
 * used for *statement sequences* in TypeScript too — middleware registration, route mounting.
 *
 * Why markers rather than ts-morph for those cases: registration order is semantically critical
 * (CORS before auth before rate-limiting) and it must be identical across all three runtimes.
 * A marker with an explicit priority states that order in the template where a reader can see
 * it. AST insertion would express the same thing implicitly, differently per language, and
 * invisibly to whoever reads the generated file.
 *
 * Base templates declare a region:
 *
 *     # >>> idp:middleware
 *     # <<< idp:middleware
 *
 * Comment syntax is per-language; the marker body is identical everywhere.
 */

export interface MarkerSyntax {
  /** Line-comment prefix, e.g. `//`, `#`. */
  comment: string;
}

export const MARKER_SYNTAX = {
  ts: { comment: '//' },
  js: { comment: '//' },
  python: { comment: '#' },
  go: { comment: '//' },
  yaml: { comment: '#' },
  shell: { comment: '#' },
} as const satisfies Record<string, MarkerSyntax>;

export class MissingMarkerError extends Error {
  constructor(
    readonly file: string,
    readonly marker: string,
  ) {
    super(
      `Marker "${marker}" not found in "${file}". The base template must declare the region ` +
        `(">>> idp:${marker}" ... "<<< idp:${marker}"). Without it the contribution would be ` +
        `silently dropped and the generated project would be missing functionality.`,
    );
    this.name = 'MissingMarkerError';
  }
}

export interface MarkerInsertion {
  /** Marker name, e.g. `middleware`. */
  marker: string;
  /** Lines to insert. */
  lines: string[];
  /** Lower runs earlier. CORS before auth before rate limiting. */
  priority: number;
  /** Recipe id, emitted as a trailing comment so generated code is traceable. */
  recipeId: string;
}

function markerPattern(syntax: MarkerSyntax, marker: string, kind: '>>>' | '<<<'): RegExp {
  const escaped = `${syntax.comment} ${kind} idp:${marker}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}\\s*$`);
}

/**
 * Inserts contributions into a marked region, replacing whatever the region held.
 *
 * Rebuilding the region wholesale — rather than appending — is what makes this idempotent:
 * running the same insertions twice yields identical output, and priority ordering is honoured
 * regardless of the order contributions arrive in.
 */
export function insertAtMarkers(
  filePath: string,
  content: string,
  syntax: MarkerSyntax,
  insertions: readonly MarkerInsertion[],
): string {
  if (insertions.length === 0) return content;

  const byMarker = new Map<string, MarkerInsertion[]>();
  for (const insertion of insertions) {
    const list = byMarker.get(insertion.marker) ?? [];
    list.push(insertion);
    byMarker.set(insertion.marker, list);
  }

  let lines = content.split('\n');

  for (const [marker, group] of [...byMarker].sort(([a], [b]) => a.localeCompare(b))) {
    const openAt = lines.findIndex((l) => markerPattern(syntax, marker, '>>>').test(l));
    const closeAt = lines.findIndex((l) => markerPattern(syntax, marker, '<<<').test(l));

    if (openAt === -1 || closeAt === -1 || closeAt < openAt) {
      throw new MissingMarkerError(filePath, marker);
    }

    const indent = /^(\s*)/.exec(lines[openAt]!)?.[1] ?? '';

    // Total ordering: priority, then recipe id. Two runs produce identical output (doc 05 §6).
    const ordered = [...group].sort(
      (a, b) => a.priority - b.priority || a.recipeId.localeCompare(b.recipeId),
    );

    const body: string[] = [];
    for (const insertion of ordered) {
      body.push(`${indent}${syntax.comment} ${insertion.recipeId}`);
      for (const line of insertion.lines) {
        body.push(line === '' ? '' : `${indent}${line}`);
      }
    }

    lines = [...lines.slice(0, openAt + 1), ...body, ...lines.slice(closeAt)];
  }

  return lines.join('\n');
}

/** True when the file declares the given marker region. Used by the verify stage. */
export function hasMarker(content: string, syntax: MarkerSyntax, marker: string): boolean {
  const lines = content.split('\n');
  return (
    lines.some((l) => markerPattern(syntax, marker, '>>>').test(l)) &&
    lines.some((l) => markerPattern(syntax, marker, '<<<').test(l))
  );
}

/** Picks marker syntax from a file extension. */
export function syntaxForPath(filePath: string): MarkerSyntax {
  if (/\.(py|pyi)$/.test(filePath)) return MARKER_SYNTAX.python;
  if (/\.go$/.test(filePath)) return MARKER_SYNTAX.go;
  if (/\.(ya?ml)$/.test(filePath)) return MARKER_SYNTAX.yaml;
  if (/\.(sh|bash)$/.test(filePath)) return MARKER_SYNTAX.shell;
  return MARKER_SYNTAX.ts;
}

/** Registration order shared by all three runtimes, so behaviour matches across them. */
export const MIDDLEWARE_PRIORITY = {
  logging: 10,
  cors: 20,
  rateLimit: 30,
  validation: 40,
  auth: 50,
  routes: 90,
  errorHandler: 100,
} as const;
