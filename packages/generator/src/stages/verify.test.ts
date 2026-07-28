import { describe, expect, it } from 'vitest';
import { FileTree } from '../tree.js';
import { verifyTree } from './verify.js';

function treeWith(files: Array<[string, string]>): FileTree {
  const tree = new FileTree();
  // Required files, so the checks under test are the only thing that can fail.
  tree.add({ path: 'README.md', content: '# x\n', producedBy: 't' });
  tree.add({ path: '.gitignore', content: 'node_modules/\n', producedBy: 't' });
  for (const [path, content] of files) {
    if (tree.has(path)) tree.replace(path, content);
    else tree.add({ path, content, producedBy: 't' });
  }
  return tree;
}

const codes = (tree: FileTree) => verifyTree(tree).diagnostics.map((d) => d.code);

describe('unrendered templates', () => {
  it.each(['<%= x %>', '<% if (a) { %>', '<%- raw %>'])('flags leftover %s', (fragment) => {
    expect(codes(treeWith([['a.ts', `const a = ${fragment};\n`]]))).toContain(
      'unrendered-template',
    );
  });

  // <%% is EJS's escape for a literal <%, so it is legitimate output.
  it('allows the escaped literal <%%', () => {
    expect(codes(treeWith([['a.md', 'Write <%% to emit a delimiter.\n']]))).not.toContain(
      'unrendered-template',
    );
  });
});

describe('parseable JSON and YAML', () => {
  it('flags malformed JSON', () => {
    expect(codes(treeWith([['package.json', '{ "a": }\n']]))).toContain('invalid-json');
  });

  it('flags malformed YAML', () => {
    expect(codes(treeWith([['deploy.yaml', 'a:\n  - b\n c: broken\n']]))).toContain('invalid-yaml');
  });

  // tsconfig.json is JSONC by specification — TypeScript accepts comments, and a generated
  // config that explains why an option is set is more useful than a bare one.
  it('allows comments in tsconfig.json', () => {
    const content = `{\n  // why this is set\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`;
    expect(codes(treeWith([['tsconfig.json', content]]))).not.toContain('invalid-json');
  });

  it('allows block comments and trailing commas in tsconfig.json', () => {
    const content = `{\n  /* block */\n  "compilerOptions": {\n    "strict": true,\n  },\n}\n`;
    expect(codes(treeWith([['tsconfig.json', content]]))).not.toContain('invalid-json');
  });

  // A naive comment stripper would corrupt any string containing "//".
  it('does not mistake a URL inside a string for a comment', () => {
    const content = `{\n  "homepage": "https://example.com/docs",\n  "a": 1\n}\n`;
    expect(codes(treeWith([['tsconfig.json', content]]))).not.toContain('invalid-json');
  });

  it('still rejects genuinely broken JSONC', () => {
    expect(codes(treeWith([['tsconfig.json', '{ "a": , }\n']]))).toContain('invalid-json');
  });

  it('keeps package.json strict — comments there are a real error', () => {
    expect(codes(treeWith([['package.json', '{\n  // nope\n  "a": 1\n}\n']]))).toContain(
      'invalid-json',
    );
  });
});

describe('secret literals', () => {
  it.each([
    ['AWS key', `const k = 'AKIAIOSFODNN7EXAMPLE';`],
    ['GitHub token', `const t = 'ghp_${'a'.repeat(36)}';`],
    ['Stripe live key', `const s = 'sk_live_${'a'.repeat(20)}';`],
    ['private key', `const p = '-----BEGIN RSA PRIVATE KEY-----';`],
  ])('flags a %s', (_label, content) => {
    expect(codes(treeWith([['src/config.ts', `${content}\n`]]))).toContain('secret-literal');
  });

  // Entropy-based detection flags these constantly, which is why we match provider prefixes.
  it.each([
    ['a git sha', `const sha = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';`],
    ['a base64 fixture', `const b = 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q=';`],
    ['a uuid', `const id = '550e8400-e29b-41d4-a716-446655440000';`],
  ])('does not flag %s', (_label, content) => {
    expect(codes(treeWith([['src/a.ts', `${content}\n`]]))).not.toContain('secret-literal');
  });

  it('does not flag an empty secret placeholder in .env.example', () => {
    expect(codes(treeWith([['.env.example', 'STRIPE_SECRET_KEY=\nPORT=3000\n']]))).not.toContain(
      'secret-literal',
    );
  });
});

describe('CORS sanity', () => {
  it('flags wildcard origin combined with credentials', () => {
    const content = `export const cors = { origin: '*', credentials: true };\n`;
    expect(codes(treeWith([['src/middleware/cors.ts', content]]))).toContain(
      'cors-wildcard-with-credentials',
    );
  });

  it('allows a wildcard without credentials', () => {
    const content = `export const cors = { origin: '*', credentials: false };\n`;
    expect(codes(treeWith([['src/middleware/cors.ts', content]]))).not.toContain(
      'cors-wildcard-with-credentials',
    );
  });
});

describe('structural checks', () => {
  it('requires README.md and .gitignore', () => {
    const bare = new FileTree();
    bare.add({ path: 'a.ts', content: 'export const a = 1;\n', producedBy: 't' });
    expect(codes(bare).filter((c) => c === 'missing-required-file')).toHaveLength(2);
  });

  it('warns about an empty file without failing the run', () => {
    const result = verifyTree(treeWith([['src/empty.ts', '   \n']]));
    expect(result.diagnostics.some((d) => d.code === 'empty-file')).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('passes a clean tree', () => {
    const result = verifyTree(treeWith([['src/a.ts', 'export const a = 1;\n']]));
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});
