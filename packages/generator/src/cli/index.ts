#!/usr/bin/env node
/**
 * `idp` — the CLI runner named in the PRD's Engineer 2 deliverables.
 *
 * Exists so the engine can be exercised without the portal: template authors iterate here,
 * the smoke-test harness drives it in CI, and any past generation can be reproduced from its
 * stored spec (`idp generate --spec <stored>`), which is what makes provisioning auditable.
 *
 * Argument parsing uses Node's built-in util.parseArgs rather than a dependency — the surface
 * is four flags, and a CLI framework would outweigh the whole command set.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { safeParseProjectSpec } from '@idp/core';
import { runPipeline, GenerationFailedError } from '../pipeline.js';
import { emitTree } from '../emit.js';
import { createRegistry } from '../recipes/index.js';
import type { Diagnostic, StageEvent } from '../types.js';

const USAGE = `
idp — Internal Developer Portal scaffolding engine

Usage:
  idp generate --spec <file> --out <dir> [--force]   Generate a project from a spec
  idp validate --spec <file>                          Validate a spec without generating
  idp list-recipes [--spec <file>]                    List recipes (all, or those a spec selects)

Options:
  --spec <file>   Path to a ProjectSpec JSON file
  --out <dir>     Output directory (generate only)
  --force         Write into a non-empty directory
  --quiet         Suppress progress output
  --help          Show this message
`.trim();

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) {
    const where = d.file ? ` ${d.file}` : '';
    console.error(`  ${d.severity}:${where} ${d.code} — ${d.message}`);
  }
}

async function readSpec(specPath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.resolve(specPath), 'utf8'));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    fail(`could not read spec "${specPath}": ${detail}`);
  }
}

async function cmdValidate(specPath: string): Promise<void> {
  const result = safeParseProjectSpec(await readSpec(specPath));

  if (!result.success) {
    console.error('Spec is invalid:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.') || '<root>'}: ${issue.message}`);
    }
    process.exit(1);
  }

  const spec = result.data;
  console.log('Spec is valid.');
  console.log(`  project:  ${spec.meta.projectName} (${spec.meta.slug})`);
  console.log(`  client:   ${spec.meta.clientName}`);
  console.log(`  target:   ${spec.meta.deploymentTarget}`);
  console.log(`  ui:       ${spec.ui ? `${spec.ui.framework} + ${spec.ui.styling}` : 'none'}`);
  console.log(`  api:      ${spec.api ? `${spec.api.runtime} + ${spec.api.paradigm}` : 'none'}`);
}

async function cmdListRecipes(specPath?: string): Promise<void> {
  const registry = createRegistry();

  if (!specPath) {
    const all = registry.all();
    if (all.length === 0) {
      console.log('No recipes are registered yet — templates land in P1.2.');
      return;
    }
    for (const recipe of all) console.log(`  ${recipe.phase.padEnd(12)} ${recipe.id}`);
    return;
  }

  const result = safeParseProjectSpec(await readSpec(specPath));
  if (!result.success) fail('spec is invalid — run `idp validate` for details');

  const selected = registry.plan(result.data);
  console.log(`${selected.length} recipe(s) selected, in execution order:`);
  for (const recipe of selected) console.log(`  ${recipe.phase.padEnd(12)} ${recipe.id}`);
}

async function cmdGenerate(specPath: string, outDir: string, force: boolean, quiet: boolean) {
  const spec = await readSpec(specPath);

  const onProgress = quiet
    ? undefined
    : (event: StageEvent) => {
        if (event.type === 'stage' && event.status === 'done') {
          console.log(`  ${event.stage.padEnd(10)} ${event.ms ?? 0}ms`);
        }
        if (event.type === 'log' && event.level !== 'info') {
          console.log(`  ${event.level}: ${event.message}`);
        }
      };

  try {
    const result = await runPipeline(spec, {
      registry: createRegistry(),
      ...(onProgress ? { onProgress } : {}),
    });

    const emitted = await emitTree(result.files, outDir, { requireEmpty: !force });

    if (!quiet) {
      console.log(
        `\nGenerated ${emitted.written} files in ${result.durationMs}ms → ${emitted.outDir}`,
      );

      const warnings = result.diagnostics.filter((d) => d.severity === 'warn');
      if (warnings.length > 0) {
        console.log(`\n${warnings.length} warning(s):`);
        printDiagnostics(warnings);
      }

      for (const resolution of result.mergeReport.dependencyResolutions) {
        console.log(
          `  resolved ${resolution.name} -> ${resolution.chosen} ` +
            `(from ${resolution.candidates.map((c) => c.version).join(', ')})`,
        );
      }

      if (result.postInstall.length > 0) {
        console.log('\nNext steps:');
        for (const step of result.postInstall) console.log(`  ${step}`);
      }
    }
  } catch (err) {
    if (err instanceof GenerationFailedError) {
      console.error(`Generation failed at the "${err.stage}" stage:`);
      printDiagnostics(err.diagnostics);
      process.exit(1);
    }
    throw err;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        spec: { type: 'string' },
        out: { type: 'string' },
        force: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  switch (command) {
    case 'generate':
      if (!values.spec) fail('generate requires --spec <file>');
      if (!values.out) fail('generate requires --out <dir>');
      await cmdGenerate(values.spec, values.out, values.force ?? false, values.quiet ?? false);
      return;

    case 'validate':
      if (!values.spec) fail('validate requires --spec <file>');
      await cmdValidate(values.spec);
      return;

    case 'list-recipes':
      await cmdListRecipes(values.spec);
      return;

    default:
      fail(`unknown command "${command}"\n\n${USAGE}`);
  }
}

// Auto-run only when executed directly, so tests can import main() without invoking it.
// Comparing resolved file URLs is the reliable ESM check — a filename regex breaks under
// symlinked npm bin shims, which is exactly how this gets installed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
