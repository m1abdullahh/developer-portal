import { describe, expect, it } from 'vitest';
import { spineSpec } from '@idp/core';
import { FrontmatterError, parseFrontmatter } from './frontmatter.js';
import { normalizeOutput, renderTemplate, TemplateRenderError } from './renderer.js';
import { h } from './helpers.js';

const ctx = { spec: spineSpec(), h };

describe('frontmatter parsing', () => {
  it('extracts to: and returns the body', () => {
    const { frontmatter, body } = parseFrontmatter('---\nto: src/a.ts\n---\nhello', 't');
    expect(frontmatter.to).toBe('src/a.ts');
    expect(body).toBe('hello');
  });

  it('parses mode as octal, not decimal', () => {
    const { frontmatter } = parseFrontmatter('---\nto: run.sh\nmode: 755\n---\n', 't');
    expect(frontmatter.mode).toBe(0o755);
    expect(frontmatter.mode).toBe(493);
  });

  it.each([
    ['missing block', 'no frontmatter here', /must begin with a `---`/],
    ['unterminated', '---\nto: a.ts\nbody', /Unterminated frontmatter/],
    ['no to:', '---\nmode: 644\n---\nbody', /must declare a `to:`/],
    ['unknown key', '---\nto: a.ts\nbogus: 1\n---\n', /Unknown frontmatter key "bogus"/],
    ['duplicate key', '---\nto: a.ts\nto: b.ts\n---\n', /Duplicate frontmatter key/],
    ['malformed line', '---\nto: a.ts\njust-a-word\n---\n', /Expected "key: value"/],
  ])('rejects %s', (_label, source, pattern) => {
    expect(() => parseFrontmatter(source, 'tpl/x.ejs.t')).toThrow(pattern);
  });

  it('reports the template path and line so the failure is locatable', () => {
    try {
      parseFrontmatter('---\nto: a.ts\nbogus: 1\n---\n', 'ui/next/layout.ejs.t');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as Error).message).toContain('ui/next/layout.ejs.t');
      expect((err as Error).message).toMatch(/:3:/);
    }
  });

  it('ignores comments and blank lines', () => {
    const { frontmatter } = parseFrontmatter('---\n# a note\n\nto: src/a.ts\n---\n', 't');
    expect(frontmatter.to).toBe('src/a.ts');
  });
});

describe('rendering', () => {
  it('renders frontmatter before parsing, so `to:` can depend on the spec', () => {
    const tpl = '---\nto: src/<%= spec.meta.slug %>.ts\n---\nexport const x = 1;';
    const file = renderTemplate(tpl, ctx, 't', 'r1');
    expect(file?.path).toBe('src/acme-health-backend.ts');
  });

  it('honours skip_if', () => {
    const tpl = '---\nto: a.ts\nskip_if: <%= spec.ui === null %>\n---\nbody';
    expect(renderTemplate(tpl, ctx, 't', 'r1')).not.toBeNull();

    const noUi = { spec: spineSpec({ ui: null }), h };
    expect(renderTemplate(tpl, noUi, 't', 'r1')).toBeNull();
  });

  it('exposes helpers', () => {
    const tpl = '---\nto: a.ts\n---\n<%= h.pascal(spec.meta.slug) %>';
    expect(renderTemplate(tpl, ctx, 't', 'r1')?.content).toBe('AcmeHealthBackend\n');
  });

  it('records the producing recipe', () => {
    const file = renderTemplate('---\nto: a.ts\n---\nx', ctx, 't', 'ui.framework.nextjs-app');
    expect(file?.producedBy).toBe('ui.framework.nextjs-app');
  });

  it('wraps EJS failures with the template path', () => {
    try {
      renderTemplate('---\nto: a.ts\n---\n<%= nope.boom %>', ctx, 'ui/broken.ejs.t', 'r1');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateRenderError);
      expect((err as Error).message).toContain('ui/broken.ejs.t');
    }
  });
});

describe('escaping', () => {
  // EJS defaults <%= %> to HTML escaping, which corrupts generated code. We override it to
  // identity; safety comes from the ProjectSpec schema having already validated these values.
  it('does not HTML-escape — generated code must stay literal', () => {
    const tpl = '---\nto: a.ts\n---\nif (a && b) return "<x>";';
    const out = renderTemplate(tpl, ctx, 't', 'r1')?.content as string;
    expect(out).toContain('a && b');
    expect(out).toContain('"<x>"');
    expect(out).not.toContain('&amp;');
    expect(out).not.toContain('&lt;');
  });

  it('interpolated values with quotes and ampersands survive intact', () => {
    const spec = spineSpec({ meta: { clientName: `O'Brien & Sons <Ltd>` } });
    const tpl = '---\nto: a.ts\n---\n// <%= spec.meta.clientName %>';
    const out = renderTemplate(tpl, { spec, h }, 't', 'r1')?.content as string;
    expect(out).toContain(`O'Brien & Sons <Ltd>`);
  });

  it('h.json produces a safe code literal for embedded strings', () => {
    const spec = spineSpec({ meta: { clientName: 'He said "hi"\nthen left' } });
    const tpl = '---\nto: a.ts\n---\nconst c = <%= h.json(spec.meta.clientName) %>;';
    const out = renderTemplate(tpl, { spec, h }, 't', 'r1')?.content as string;
    expect(out.trim()).toBe('const c = "He said \\"hi\\"\\nthen left";');
    expect(JSON.parse(out.trim().slice(10, -1))).toBe('He said "hi"\nthen left');
  });
});

describe('normalizeOutput', () => {
  // Without this, Windows and Linux authoring machines produce different bytes and every
  // golden-file test fails on the wrong platform.
  it('converts CRLF to LF', () => {
    expect(normalizeOutput('a\r\nb\r\n')).toBe('a\nb\n');
  });

  it('ends with exactly one newline', () => {
    expect(normalizeOutput('a')).toBe('a\n');
    expect(normalizeOutput('a\n\n\n')).toBe('a\n');
  });

  it('leaves empty output empty rather than emitting a lone newline', () => {
    expect(normalizeOutput('   \n  ')).toBe('');
  });
});
