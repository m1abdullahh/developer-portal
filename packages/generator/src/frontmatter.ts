/**
 * Hygen-style `.ejs.t` frontmatter.
 *
 * Format (the `to:` key is required, everything else optional):
 *
 *   ---
 *   to: src/stores/use<%= h.pascal(name) %>Store.ts
 *   skip_if: <%= !spec.ui %>
 *   mode: 755
 *   ---
 *   <template body>
 *
 * Frontmatter is EJS-rendered *before* parsing, so `to:` can depend on the spec. That ordering
 * is what allows one template to emit different paths per project rather than needing a
 * template per variant.
 *
 * Parsed with a deliberately small key/value reader rather than a YAML parser: the accepted key
 * set is fixed and closed (below), and full YAML would invite templates to encode logic in
 * frontmatter that belongs in a recipe.
 */

export interface Frontmatter {
  /** Destination path relative to the project root. Required. */
  to: string;
  /** When truthy, the template produces nothing. Used for conditional files. */
  skipIf?: boolean;
  /** Unix file mode, e.g. 0o755 for shell scripts. */
  mode?: number;
  /** When true, an existing file at `to` is left untouched instead of colliding. */
  unlessExists?: boolean;
}

export interface ParsedTemplate {
  frontmatter: Frontmatter;
  body: string;
}

const FRONTMATTER_KEYS = new Set(['to', 'skip_if', 'mode', 'unless_exists']);

const DELIMITER = /^---[ \t]*$/;

export class FrontmatterError extends Error {
  constructor(
    message: string,
    readonly templatePath: string,
    readonly line?: number,
  ) {
    super(
      line === undefined ? `${templatePath}: ${message}` : `${templatePath}:${line}: ${message}`,
    );
    this.name = 'FrontmatterError';
  }
}

function parseBoolean(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  // EJS renders booleans to the strings "true"/"false"; empty means the expression
  // produced undefined/null, which we treat as false.
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Splits an already-EJS-rendered template into frontmatter and body.
 *
 * `templatePath` is carried purely for error messages — a frontmatter mistake in one of
 * hundreds of templates is close to impossible to locate without it.
 */
export function parseFrontmatter(rendered: string, templatePath: string): ParsedTemplate {
  const lines = rendered.split(/\r?\n/);

  let cursor = 0;
  // Tolerate a leading blank line or BOM before the opening delimiter.
  while (cursor < lines.length && lines[cursor]!.trim() === '') cursor++;

  if (cursor >= lines.length || !DELIMITER.test(lines[cursor]!.trim())) {
    throw new FrontmatterError(
      'Template must begin with a `---` frontmatter block declaring at least `to:`.',
      templatePath,
      cursor + 1,
    );
  }

  const start = cursor;
  cursor++;

  // Locate the closing delimiter BEFORE parsing any keys.
  //
  // Error precedence matters here: with `---\nto: a.ts\nbody`, parsing key-by-key would report
  // 'Expected "key: value" but found "body"' when the real mistake is the missing `---`.
  // Pointing at the wrong line sends the author hunting in the wrong place.
  let closeIndex = -1;
  for (let i = cursor; i < lines.length; i++) {
    if (DELIMITER.test(lines[i]!.trim())) {
      closeIndex = i;
      break;
    }
  }

  if (closeIndex === -1) {
    throw new FrontmatterError(
      'Unterminated frontmatter block — missing the closing `---`.',
      templatePath,
      start + 1,
    );
  }

  const raw: Record<string, string> = {};

  for (; cursor < closeIndex; cursor++) {
    const line = lines[cursor]!;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new FrontmatterError(
        `Expected "key: value" but found "${trimmed}".`,
        templatePath,
        cursor + 1,
      );
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (!FRONTMATTER_KEYS.has(key)) {
      throw new FrontmatterError(
        `Unknown frontmatter key "${key}". Supported: ${[...FRONTMATTER_KEYS].join(', ')}.`,
        templatePath,
        cursor + 1,
      );
    }
    if (key in raw) {
      throw new FrontmatterError(`Duplicate frontmatter key "${key}".`, templatePath, cursor + 1);
    }
    raw[key] = value;
  }

  cursor = closeIndex + 1;

  const to = raw['to'];
  if (!to) {
    throw new FrontmatterError(
      'Frontmatter must declare a `to:` destination.',
      templatePath,
      start + 1,
    );
  }

  const frontmatter: Frontmatter = { to };

  if (raw['skip_if'] !== undefined) frontmatter.skipIf = parseBoolean(raw['skip_if']);
  if (raw['unless_exists'] !== undefined)
    frontmatter.unlessExists = parseBoolean(raw['unless_exists']);

  if (raw['mode'] !== undefined && raw['mode'] !== '') {
    // Always octal — file modes are universally written that way, and parsing "755" as
    // decimal 755 would produce silently wrong permissions.
    const mode = Number.parseInt(raw['mode'], 8);
    if (Number.isNaN(mode)) {
      throw new FrontmatterError(
        `Invalid mode "${raw['mode']}" — expected octal, e.g. 755.`,
        templatePath,
      );
    }
    frontmatter.mode = mode;
  }

  return { frontmatter, body: lines.slice(cursor).join('\n') };
}
