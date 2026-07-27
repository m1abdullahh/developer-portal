/**
 * Slug validation — see docs/plan/01-wizard-step1-metadata-governance.md §1.2
 *
 * The slug becomes, simultaneously:
 *   - a GitHub repository name
 *   - a Kubernetes resource name (RFC 1123 label)
 *   - a Docker image tag component
 *   - a filesystem directory name
 *
 * It therefore has to satisfy the intersection of all four rule sets, which is stricter
 * than any one of them alone.
 */

/** RFC 1123 label: lowercase alphanumeric, single hyphens between segments, must start with a letter. */
export const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * K8s labels cap at 63 chars. Generated resources append suffixes (`-deployment`, `-ingress`,
 * `-hpa`, `-serviceaccount`), the longest of which is 15 chars. 48 leaves safe headroom.
 */
export const SLUG_MAX_LENGTH = 48;
export const SLUG_MIN_LENGTH = 3;

/**
 * Names that pass the regex but break something downstream.
 *
 * Windows device names are the sharp one: a repo called `con` cannot be cloned on Windows at
 * all — `git` fails when it tries to create the directory. Silent, confusing, and unfixable
 * after the repo exists.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Windows reserved device names
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
  // Path / tooling collisions
  'git',
  'node-modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'test',
  'tests',
  'src',
  'lib',
  'bin',
  'tmp',
  'temp',
  // Infrastructure namespaces we must not shadow
  'api',
  'www',
  'admin',
  'internal',
  'default',
  'kube-system',
  'kube-public',
  'argocd',
  'ingress-nginx',
  'cert-manager',
  'monitoring',
  'istio-system',
  // Our own reserved words
  'idp',
  'portal',
  'catalog',
  'wizard',
]);

export type SlugProblem =
  | 'too-short'
  | 'too-long'
  | 'invalid-format'
  | 'reserved'
  | 'leading-digit'
  | 'consecutive-hyphens'
  | 'trailing-hyphen';

export interface SlugValidation {
  valid: boolean;
  problem?: SlugProblem;
  /** Human-facing, actionable. Never "invalid input". */
  message?: string;
}

/**
 * Validates a slug and, on failure, explains precisely what is wrong.
 *
 * Checks run most-specific-first so the message points at the actual mistake rather than
 * falling back to a generic format complaint.
 */
export function validateSlug(slug: string): SlugValidation {
  if (slug.length < SLUG_MIN_LENGTH) {
    return {
      valid: false,
      problem: 'too-short',
      message: `Must be at least ${SLUG_MIN_LENGTH} characters.`,
    };
  }

  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      valid: false,
      problem: 'too-long',
      message:
        `Must be ${SLUG_MAX_LENGTH} characters or fewer (currently ${slug.length}). ` +
        `Kubernetes appends suffixes such as "-deployment", so we reserve headroom.`,
    };
  }

  if (/^[0-9]/.test(slug)) {
    return {
      valid: false,
      problem: 'leading-digit',
      message: 'Must start with a letter — Kubernetes resource names cannot begin with a digit.',
    };
  }

  if (slug.endsWith('-')) {
    return { valid: false, problem: 'trailing-hyphen', message: 'Cannot end with a hyphen.' };
  }

  if (slug.includes('--')) {
    return {
      valid: false,
      problem: 'consecutive-hyphens',
      message: 'Cannot contain consecutive hyphens — use a single hyphen between words.',
    };
  }

  if (!SLUG_RE.test(slug)) {
    return {
      valid: false,
      problem: 'invalid-format',
      message: 'Use lowercase letters, digits and single hyphens only (e.g. acme-health-backend).',
    };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return {
      valid: false,
      problem: 'reserved',
      message: `"${slug}" is reserved — it collides with a system, tooling or namespace name.`,
    };
  }

  return { valid: true };
}

/**
 * Derives a candidate slug from free-text input.
 * Used to prefill the slug field from the project name until the user edits it directly.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[0-9]+/, '') // a leading digit is invalid, so drop it
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/**
 * Suggests alternatives when a slug is taken. Ordered most-natural-first.
 * `year` is injected rather than read from the clock — templates and suggestions must be
 * deterministic for golden-file testing (doc 05 §6).
 */
export function suggestSlugs(slug: string, year: number): string[] {
  const base = slug.slice(0, SLUG_MAX_LENGTH - 5).replace(/-+$/, '');
  return [`${base}-2`, `${base}-api`, `${base}-svc`, `${base}-${year}`].filter(
    (s) => validateSlug(s).valid,
  );
}
