/**
 * Template helpers, exposed to every template as `h`.
 *
 * Kept deliberately small and pure. Anything requiring a decision belongs in a recipe, not in
 * a template — templates that compute things are the reason generator codebases become
 * impossible to reason about.
 */

/** Splits any casing convention into lowercase words. */
function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export const h = {
  /** acme-health-backend -> AcmeHealthBackend */
  pascal(input: string): string {
    return words(input)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  },

  /** acme-health-backend -> acmeHealthBackend */
  camel(input: string): string {
    const pascal = h.pascal(input);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  },

  /** AcmeHealthBackend -> acme-health-backend */
  kebab(input: string): string {
    return words(input).join('-');
  },

  /** AcmeHealthBackend -> acme_health_backend */
  snake(input: string): string {
    return words(input).join('_');
  },

  /** acme-health-backend -> ACME_HEALTH_BACKEND (env var names) */
  constant(input: string): string {
    return words(input).join('_').toUpperCase();
  },

  /** acme-health-backend -> Acme health backend (prose) */
  sentence(input: string): string {
    const parts = words(input);
    if (parts.length === 0) return '';
    return parts.join(' ').replace(/^./, (c) => c.toUpperCase());
  },

  /**
   * JSON-encodes a value for safe embedding in generated source.
   *
   * Use for any spec-derived string that lands inside code — `const name = <%- h.json(x) %>`
   * — so quotes and newlines cannot break out of the literal.
   */
  json(value: unknown): string {
    return JSON.stringify(value ?? null);
  },

  /** Indents every line after the first — for embedding blocks inside existing structures. */
  indent(text: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return text
      .split('\n')
      .map((line, i) => (i === 0 || line === '' ? line : pad + line))
      .join('\n');
  },

  /** Wraps text as a line-comment block in the given syntax. */
  comment(text: string, prefix = '//'): string {
    return text
      .split('\n')
      .map((line) => (line ? `${prefix} ${line}` : prefix))
      .join('\n');
  },
} as const;

export type TemplateHelpers = typeof h;
