/**
 * Line-oriented file composition (.gitignore, .dockerignore, .npmrc).
 *
 * ── Why these are NOT sorted ─────────────────────────────────────────────────
 * The obvious implementation is "union the lines, dedupe, sort". That is wrong for ignore
 * files, because their semantics are order-dependent:
 *
 *     dist/
 *     !dist/keep.txt      <- re-includes, but ONLY if it comes after the rule it negates
 *
 * Sorting puts `!dist/keep.txt` before `dist/`, silently reversing the author's intent. So we
 * preserve contribution order and group by recipe instead. Determinism still holds, because
 * recipe order is itself deterministic (doc 05 §2).
 */

interface LineContribution {
  recipeId: string;
  lines: string[];
}

export class LineFileBuilder {
  readonly #contributions: LineContribution[] = [];

  constructor(private readonly header?: string) {}

  add(recipeId: string, lines: readonly string[]): void {
    const cleaned = lines.map((l) => l.trimEnd()).filter((l) => l !== '');
    if (cleaned.length > 0) this.#contributions.push({ recipeId, lines: cleaned });
  }

  /**
   * Renders the file, grouped by recipe, with exact-duplicate lines removed.
   *
   * Dedupe is global and first-wins: a later recipe repeating `node_modules/` contributes
   * nothing, so the output does not accumulate the same rule six times.
   */
  build(): string {
    const seen = new Set<string>();
    const blocks: string[] = [];

    for (const { recipeId, lines } of this.#contributions) {
      const fresh = lines.filter((line) => {
        // Comments are per-group context, so they are never deduped against other groups.
        if (line.startsWith('#')) return true;
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });

      // A group that contributed only duplicates and its own comments adds nothing.
      if (fresh.every((l) => l.startsWith('#'))) continue;

      blocks.push([`# ${recipeId}`, ...fresh].join('\n'));
    }

    if (blocks.length === 0) return '';

    const body = blocks.join('\n\n');
    return this.header ? `${this.header}\n\n${body}\n` : `${body}\n`;
  }
}
