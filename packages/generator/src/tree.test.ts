import { describe, expect, it } from 'vitest';
import { FileCollisionError, FileTree, normalizePath } from './tree.js';
import type { VirtualFile } from './types.js';

function file(path: string, content = 'x', producedBy = 'test'): VirtualFile {
  return { path, content, producedBy };
}

describe('normalizePath', () => {
  it.each([
    ['src/index.ts', 'src/index.ts'],
    ['src\\index.ts', 'src/index.ts'],
    ['./src/index.ts', 'src/index.ts'],
    ['src//index.ts', 'src/index.ts'],
    ['src/./nested/../index.ts', 'src/index.ts'],
    ['/src/index.ts', 'src/index.ts'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  // Templates get authored on Windows; without this the same file lands under two keys and
  // the collision check misses it entirely.
  it('treats backslash and forward slash paths as the same file', () => {
    const tree = new FileTree();
    tree.add(file('src/app/page.tsx'));
    expect(() => tree.add(file('src\\app\\page.tsx'))).toThrow(FileCollisionError);
  });

  it('refuses to escape the project root', () => {
    expect(() => normalizePath('../outside.ts')).toThrow(/escapes the project root/);
    expect(() => normalizePath('src/../../etc/passwd')).toThrow(/escapes the project root/);
  });

  it('rejects a path that resolves to nothing', () => {
    expect(() => normalizePath('./')).toThrow(/resolves to nothing/);
  });
});

describe('FileTree collisions', () => {
  it('names both recipes when two claim the same path', () => {
    const tree = new FileTree();
    tree.add(file('app/layout.tsx', 'a', 'ui.framework.nextjs-app'));

    try {
      tree.add(file('app/layout.tsx', 'b', 'ui.state.zustand'));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FileCollisionError);
      const msg = (err as Error).message;
      expect(msg).toContain('ui.framework.nextjs-app');
      expect(msg).toContain('ui.state.zustand');
      // The message must point at the fix, not just the symptom.
      expect(msg).toMatch(/merge strategy or an AST codemod/);
    }
  });

  it('never silently overwrites — the whole point of strict add()', () => {
    const tree = new FileTree();
    tree.add(file('a.ts', 'original'));
    expect(() => tree.add(file('a.ts', 'clobbered'))).toThrow();
    expect(tree.readText('a.ts')).toBe('original');
  });
});

describe('FileTree mutation', () => {
  it('replace() keeps the original owner', () => {
    const tree = new FileTree();
    tree.add(file('a.ts', 'before', 'recipe.one'));
    tree.replace('a.ts', 'after');
    expect(tree.readText('a.ts')).toBe('after');
    expect(tree.get('a.ts')?.producedBy).toBe('recipe.one');
  });

  it('replace() refuses to create a file', () => {
    expect(() => new FileTree().replace('missing.ts', 'x')).toThrow(/no such file/i);
  });

  it('set() overwrites deliberately — used by merge strategies', () => {
    const tree = new FileTree();
    tree.add(file('package.json', '{}', 'r1'));
    tree.set(file('package.json', '{"merged":true}', 'merge'));
    expect(tree.readText('package.json')).toBe('{"merged":true}');
  });
});

describe('FileTree ordering', () => {
  // Golden-file tests compare whole trees, so emission order must not vary by insertion order.
  it('emits sorted by path regardless of insertion order', () => {
    const a = new FileTree();
    for (const p of ['z.ts', 'a.ts', 'm/b.ts', 'm/a.ts']) a.add(file(p));

    const b = new FileTree();
    for (const p of ['m/a.ts', 'z.ts', 'm/b.ts', 'a.ts']) b.add(file(p));

    expect(a.paths()).toEqual(b.paths());
    expect(a.paths()).toEqual(['a.ts', 'm/a.ts', 'm/b.ts', 'z.ts']);
  });
});

describe('FileTree reads', () => {
  it('readText rejects binary content rather than mangling it', () => {
    const tree = new FileTree();
    tree.add({ path: 'logo.png', content: new Uint8Array([1, 2, 3]), producedBy: 'test' });
    expect(() => tree.readText('logo.png')).toThrow(/binary/);
  });

  it('reports size and membership', () => {
    const tree = new FileTree();
    expect(tree.size).toBe(0);
    tree.add(file('a.ts'));
    expect(tree.size).toBe(1);
    expect(tree.has('./a.ts')).toBe(true);
    expect(tree.delete('a.ts')).toBe(true);
    expect(tree.size).toBe(0);
  });
});
