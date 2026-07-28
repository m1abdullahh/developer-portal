import { describe, expect, it } from 'vitest';
import {
  addImport,
  addObjectProperty,
  addToArray,
  applyTsCodemods,
  CodemodError,
  wrapJsxChildren,
} from './ts-ops.js';
import { PROVIDER_PRIORITY, type ProviderWrap } from './providers.js';
import {
  hasMarker,
  insertAtMarkers,
  MARKER_SYNTAX,
  MIDDLEWARE_PRIORITY,
  MissingMarkerError,
  syntaxForPath,
} from './markers.js';

const LAYOUT = `import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const provider = (
  component: string,
  priority: number,
  extra: Partial<ProviderWrap> = {},
): ProviderWrap => ({
  component,
  priority,
  import: { module: `@/providers/${component}`, named: [component] },
  ...extra,
});

describe('addImport', () => {
  it('adds a new import declaration', () => {
    const out = applyTsCodemods('a.ts', `const x = 1;\n`, [
      (s) => addImport(s, { module: 'zod', named: ['z'] }),
    ]);
    expect(out).toContain(`import { z } from "zod"`);
  });

  it('merges into an existing declaration for the same module', () => {
    const out = applyTsCodemods('a.ts', `import { a } from "m";\n`, [
      (s) => addImport(s, { module: 'm', named: ['b'] }),
    ]);
    expect(out.match(/from "m"/g)).toHaveLength(1);
    expect(out).toContain('a');
    expect(out).toContain('b');
  });

  // Without the guard, a retried generation yields `import { z, z, z }`.
  it('is idempotent', () => {
    const op = (s: Parameters<typeof addImport>[0]) =>
      addImport(s, { module: 'zod', named: ['z'] });
    const once = applyTsCodemods('a.ts', `const x = 1;\n`, [op]);
    const twice = applyTsCodemods('a.ts', once, [op]);
    expect(twice).toBe(once);
  });

  it('widens a type-only import when a value import is needed', () => {
    const out = applyTsCodemods('a.ts', `import type { A } from "m";\n`, [
      (s) => addImport(s, { module: 'm', named: ['B'] }),
    ]);
    expect(out).not.toContain('import type');
  });

  it('adds a default import alongside named ones', () => {
    const out = applyTsCodemods('a.ts', `import { a } from "m";\n`, [
      (s) => addImport(s, { module: 'm', defaultImport: 'D' }),
    ]);
    expect(out).toContain('D');
  });
});

describe('wrapJsxChildren', () => {
  it('wraps children in a single provider', () => {
    const out = applyTsCodemods('layout.tsx', LAYOUT, [
      (s) => wrapJsxChildren(s, [provider('AuthProvider', PROVIDER_PRIORITY.auth)]),
    ]);
    expect(out).toContain('<AuthProvider>{children}</AuthProvider>');
    expect(out).toContain('AuthProvider');
  });

  // Nesting order is not cosmetic: a provider reading from another must sit inside it, or the
  // generated app crashes at runtime with "must be used within a Provider".
  it('nests by priority — lower number further outside', () => {
    const out = applyTsCodemods('layout.tsx', LAYOUT, [
      (s) =>
        wrapJsxChildren(s, [
          provider('AuthProvider', PROVIDER_PRIORITY.auth),
          provider('ThemeProvider', PROVIDER_PRIORITY.theme),
          provider('QueryClientProvider', PROVIDER_PRIORITY.query),
        ]),
    ]);

    const theme = out.indexOf('<ThemeProvider>');
    const query = out.indexOf('<QueryClientProvider>');
    const auth = out.indexOf('<AuthProvider>');
    expect(theme).toBeLessThan(query);
    expect(query).toBeLessThan(auth);
  });

  it('produces the same nesting regardless of the order wraps are supplied', () => {
    const run = (wraps: ProviderWrap[]) =>
      applyTsCodemods('layout.tsx', LAYOUT, [(s) => wrapJsxChildren(s, wraps)]);

    const a = provider('AuthProvider', PROVIDER_PRIORITY.auth);
    const t = provider('ThemeProvider', PROVIDER_PRIORITY.theme);
    expect(run([a, t])).toBe(run([t, a]));
  });

  it('is idempotent — never double-nests', () => {
    const op = (s: Parameters<typeof wrapJsxChildren>[0]) =>
      wrapJsxChildren(s, [provider('ThemeProvider', PROVIDER_PRIORITY.theme)]);

    const once = applyTsCodemods('layout.tsx', LAYOUT, [op]);
    const twice = applyTsCodemods('layout.tsx', once, [op]);
    expect(twice).toBe(once);
    expect(once.match(/<ThemeProvider>/g)).toHaveLength(1);
  });

  it('supports props and preamble statements', () => {
    const out = applyTsCodemods('layout.tsx', LAYOUT, [
      (s) =>
        wrapJsxChildren(s, [
          provider('QueryClientProvider', PROVIDER_PRIORITY.query, {
            props: 'client={queryClient}',
            preamble: ['const queryClient = new QueryClient();'],
          }),
        ]),
    ]);
    expect(out).toContain('client={queryClient}');
    expect(out).toContain('const queryClient = new QueryClient();');
  });

  it('does not duplicate a preamble on re-application', () => {
    const op = (s: Parameters<typeof wrapJsxChildren>[0]) =>
      wrapJsxChildren(s, [
        provider('QueryClientProvider', PROVIDER_PRIORITY.query, {
          props: 'client={queryClient}',
          preamble: ['const queryClient = new QueryClient();'],
        }),
      ]);
    const once = applyTsCodemods('layout.tsx', LAYOUT, [op]);
    const twice = applyTsCodemods('layout.tsx', once, [op]);
    expect(twice.match(/new QueryClient\(\)/g)).toHaveLength(1);
  });

  it('fails clearly when the layout has no {children}', () => {
    expect(() =>
      applyTsCodemods('layout.tsx', `export default function L() { return <div />; }\n`, [
        (s) => wrapJsxChildren(s, [provider('P', 10)]),
      ]),
    ).toThrow(CodemodError);
  });

  it('does nothing when given no wraps', () => {
    expect(applyTsCodemods('layout.tsx', LAYOUT, [(s) => wrapJsxChildren(s, [])])).toBe(LAYOUT);
  });
});

describe('addToArray / addObjectProperty', () => {
  const CONFIG = `export default {\n  plugins: [react()],\n};\n`;

  it('appends to an array property', () => {
    const out = applyTsCodemods('vite.config.ts', CONFIG, [
      (s) => addToArray(s, 'plugins', ['tsconfigPaths()']),
    ]);
    expect(out).toContain('react()');
    expect(out).toContain('tsconfigPaths()');
  });

  it('is idempotent', () => {
    const op = (s: Parameters<typeof addToArray>[0]) =>
      addToArray(s, 'plugins', ['tsconfigPaths()']);
    const once = applyTsCodemods('vite.config.ts', CONFIG, [op]);
    const twice = applyTsCodemods('vite.config.ts', once, [op]);
    expect(twice).toBe(once);
  });

  it('throws when the property does not exist', () => {
    expect(() => applyTsCodemods('c.ts', CONFIG, [(s) => addToArray(s, 'missing', ['x'])])).toThrow(
      CodemodError,
    );
  });

  it('sets and overwrites an object property', () => {
    const src = `const config = {\n  a: 1,\n};\n`;
    const out = applyTsCodemods('c.ts', src, [(s) => addObjectProperty(s, 'config', 'b', '2')]);
    expect(out).toContain('b: 2');

    const over = applyTsCodemods('c.ts', out, [(s) => addObjectProperty(s, 'config', 'b', '3')]);
    expect(over).toContain('b: 3');
    expect(over.match(/b:/g)).toHaveLength(1);
  });
});

describe('marker insertion', () => {
  const PY = `from fastapi import FastAPI

app = FastAPI()

# >>> idp:middleware
# <<< idp:middleware
`;

  it('inserts into a marked region', () => {
    const out = insertAtMarkers('main.py', PY, MARKER_SYNTAX.python, [
      {
        marker: 'middleware',
        lines: ['app.add_middleware(CORSMiddleware)'],
        priority: MIDDLEWARE_PRIORITY.cors,
        recipeId: 'api.middleware.cors',
      },
    ]);
    expect(out).toContain('app.add_middleware(CORSMiddleware)');
    expect(out).toContain('# api.middleware.cors');
  });

  // Ordering must match across Node, Python and Go, or the same spec behaves differently
  // depending on the runtime chosen.
  it('orders by priority regardless of arrival order', () => {
    const out = insertAtMarkers('main.py', PY, MARKER_SYNTAX.python, [
      {
        marker: 'middleware',
        lines: ['auth()'],
        priority: MIDDLEWARE_PRIORITY.auth,
        recipeId: 'r.auth',
      },
      {
        marker: 'middleware',
        lines: ['logging()'],
        priority: MIDDLEWARE_PRIORITY.logging,
        recipeId: 'r.log',
      },
      {
        marker: 'middleware',
        lines: ['cors()'],
        priority: MIDDLEWARE_PRIORITY.cors,
        recipeId: 'r.cors',
      },
    ]);
    expect(out.indexOf('logging()')).toBeLessThan(out.indexOf('cors()'));
    expect(out.indexOf('cors()')).toBeLessThan(out.indexOf('auth()'));
  });

  // Rebuilding the region wholesale, rather than appending, is what makes this idempotent.
  it('is idempotent', () => {
    const insertions = [
      { marker: 'middleware', lines: ['cors()'], priority: 20, recipeId: 'r.cors' },
    ];
    const once = insertAtMarkers('main.py', PY, MARKER_SYNTAX.python, insertions);
    const twice = insertAtMarkers('main.py', once, MARKER_SYNTAX.python, insertions);
    expect(twice).toBe(once);
    expect(once.match(/cors\(\)/g)).toHaveLength(1);
  });

  it('preserves the indentation of the marker', () => {
    const indented = `def setup():\n    # >>> idp:mw\n    # <<< idp:mw\n`;
    const out = insertAtMarkers('a.py', indented, MARKER_SYNTAX.python, [
      { marker: 'mw', lines: ['register()'], priority: 1, recipeId: 'r' },
    ]);
    expect(out).toContain('    register()');
  });

  // A base-template edit that drops a marker would otherwise silently produce a project with
  // no middleware registered at all.
  it('fails loudly when the marker is missing', () => {
    try {
      insertAtMarkers('main.py', 'app = FastAPI()\n', MARKER_SYNTAX.python, [
        { marker: 'middleware', lines: ['x()'], priority: 1, recipeId: 'r' },
      ]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MissingMarkerError);
      expect((err as Error).message).toMatch(/silently dropped/);
    }
  });

  it('leaves content untouched when there is nothing to insert', () => {
    expect(insertAtMarkers('main.py', PY, MARKER_SYNTAX.python, [])).toBe(PY);
  });

  it('detects marker presence for the verify stage', () => {
    expect(hasMarker(PY, MARKER_SYNTAX.python, 'middleware')).toBe(true);
    expect(hasMarker(PY, MARKER_SYNTAX.python, 'routes')).toBe(false);
  });

  it.each([
    ['app/main.py', '#'],
    ['cmd/server/main.go', '//'],
    ['deploy/values.yaml', '#'],
    ['src/index.ts', '//'],
    ['scripts/run.sh', '#'],
  ])('picks comment syntax for %s', (path, comment) => {
    expect(syntaxForPath(path).comment).toBe(comment);
  });
});
