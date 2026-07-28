/**
 * Structured deep merge for JSON and YAML documents (tsconfig.json, docker-compose.yml,
 * Helm values.yaml).
 *
 * Array handling is the interesting decision. Three plausible policies exist — replace,
 * concatenate, or union — and each is right somewhere:
 *
 *   tsconfig `include`      union      two recipes both want their directories compiled
 *   tsconfig `lib`          union      additive capability list
 *   compose `ports`         union      each recipe publishes its own port
 *   ESLint `extends`        concat     order is significant, later overrides earlier
 *
 * Union-with-dedupe is the default because it is the only one that never loses a contribution.
 * `concatArrays` opts a specific path into order-preserving concatenation for cases like
 * `extends`, where deduping across recipes would change resolution order.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonObject = { [k: string]: JsonValue };

export interface DeepMergeOptions {
  /**
   * Dotted paths whose arrays should be concatenated in order rather than union-deduped.
   * Example: `['extends', 'plugins']`.
   */
  concatArrays?: readonly string[];
  /** Called when two sources set the same scalar path to different values. */
  onScalarConflict?: (path: string, existing: JsonValue, incoming: JsonValue) => void;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable stringify for array dedupe — object elements compare by content, not identity. */
function identity(value: JsonValue): string {
  if (isPlainObject(value)) {
    const sorted = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${identity(value[k]!)}`);
    return `{${sorted.join(',')}}`;
  }
  if (Array.isArray(value)) return `[${value.map(identity).join(',')}]`;
  return JSON.stringify(value);
}

function mergeArrays(a: JsonValue[], b: JsonValue[], concat: boolean): JsonValue[] {
  if (concat) return [...a, ...b];

  const out: JsonValue[] = [];
  const seen = new Set<string>();
  for (const item of [...a, ...b]) {
    const key = identity(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Merges `incoming` into `base`, returning a new object. Neither input is mutated.
 * Later values win for scalars; conflicts are reported through `onScalarConflict`.
 */
export function deepMerge(
  base: JsonObject,
  incoming: JsonObject,
  options: DeepMergeOptions = {},
  pathPrefix = '',
): JsonObject {
  const result: JsonObject = { ...base };

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;
    const existing = result[key];

    if (existing === undefined) {
      result[key] = incomingValue;
      continue;
    }

    if (isPlainObject(existing) && isPlainObject(incomingValue)) {
      result[key] = deepMerge(existing, incomingValue, options, path);
      continue;
    }

    if (Array.isArray(existing) && Array.isArray(incomingValue)) {
      const concat = options.concatArrays?.includes(path) ?? false;
      result[key] = mergeArrays(existing, incomingValue, concat);
      continue;
    }

    if (identity(existing) !== identity(incomingValue)) {
      options.onScalarConflict?.(path, existing, incomingValue);
    }
    result[key] = incomingValue;
  }

  return result;
}

/** Recursively sorts object keys so serialised output is byte-stable across runs. */
export function sortDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!isPlainObject(value)) return value;

  const out: JsonObject = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortDeep(value[key]!);
  }
  return out;
}
