/**
 * .env.example and SECRETS.md composition.
 *
 * Recipes declare the environment they need; this assembles the union. Keys are grouped by the
 * recipe that introduced them with a header comment, because a flat list of thirty variables
 * tells a developer nothing about which ones matter for the feature they are touching.
 *
 * Secrets never get a value. The generator emits the key and a description, and SECRETS.md
 * explains what to set — populating real values is a deliberate human step (doc 00 §7).
 */

import type { EnvVar } from '../types.js';
import type { MergeReportBuilder } from './report.js';

interface EnvContribution {
  recipeId: string;
  vars: EnvVar[];
}

export class EnvBuilder {
  readonly #contributions: EnvContribution[] = [];

  add(recipeId: string, vars: EnvVar[]): void {
    if (vars.length > 0) this.#contributions.push({ recipeId, vars });
  }

  /**
   * Resolves the union, warning when two recipes declare the same key differently.
   *
   * First declaration wins. That is deterministic because recipe order is deterministic
   * (doc 05 §2), and it favours the base recipe over later features — the framework's notion
   * of `DATABASE_URL` should beat a feature's.
   */
  #resolve(report: MergeReportBuilder): Array<{ recipeId: string; vars: EnvVar[] }> {
    const seen = new Map<string, { recipeId: string; v: EnvVar }>();
    const grouped: Array<{ recipeId: string; vars: EnvVar[] }> = [];

    for (const { recipeId, vars } of this.#contributions) {
      const kept: EnvVar[] = [];

      for (const v of vars) {
        const existing = seen.get(v.key);
        if (!existing) {
          seen.set(v.key, { recipeId, v });
          kept.push(v);
          continue;
        }

        const differs =
          existing.v.example !== v.example ||
          existing.v.required !== v.required ||
          existing.v.secret !== v.secret;

        if (differs) {
          report.warn(
            'env-key-conflict',
            `"${v.key}" is declared by both "${existing.recipeId}" and "${recipeId}" with ` +
              `different settings. Keeping the declaration from "${existing.recipeId}".`,
            { recipeId },
          );
        }
      }

      if (kept.length > 0) grouped.push({ recipeId, vars: kept });
    }

    return grouped;
  }

  /** Renders .env.example, grouped by contributing recipe. */
  buildEnvExample(report: MergeReportBuilder): string {
    const grouped = this.#resolve(report);
    if (grouped.length === 0) return '';

    const lines: string[] = [
      '# Environment variables for this project.',
      '# Copy to .env and fill in the values. See SECRETS.md for the ones marked secret.',
    ];

    for (const { recipeId, vars } of grouped) {
      lines.push('', `# ── ${recipeId} ${'─'.repeat(Math.max(0, 60 - recipeId.length))}`);

      for (const v of vars) {
        lines.push(`# ${v.description}${v.required ? '' : ' (optional)'}`);
        // A secret's example is deliberately blank: writing a plausible-looking placeholder
        // is how fake credentials end up committed and then trusted.
        lines.push(`${v.key}=${v.secret ? '' : v.example}`);
      }
    }

    return `${lines.join('\n')}\n`;
  }

  /** Renders SECRETS.md, or null when the project needs no secrets. */
  buildSecretsDoc(report: MergeReportBuilder): string | null {
    const secrets = this.#resolve(report).flatMap(({ recipeId, vars }) =>
      vars.filter((v) => v.secret).map((v) => ({ recipeId, v })),
    );

    if (secrets.length === 0) return null;

    const lines: string[] = [
      '# Secrets',
      '',
      'These values are **not** generated and are **not** committed. Set them in your',
      'deployment platform or secret manager before the service will start.',
      '',
      '| Variable | Required | Needed by | What it is |',
      '| --- | --- | --- | --- |',
    ];

    for (const { recipeId, v } of secrets) {
      lines.push(
        `| \`${v.key}\` | ${v.required ? 'yes' : 'no'} | ${recipeId} | ${v.description} |`,
      );
    }

    lines.push(
      '',
      '> The generator never writes a real secret value. If you find one in this repository,',
      '> treat it as compromised and rotate it.',
    );

    return `${lines.join('\n')}\n`;
  }
}
