---
to: <%= framework.sourceRoot %>components/ui/theme.ts
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { createTheme } from '@mui/material/styles';

/**
 * The design tokens, expressed as an MUI theme.
 *
 * MUI does not read CSS custom properties, so the tokens cannot simply be referenced the way the
 * Tailwind and CSS Modules systems reference them — they have to be restated here in the shape
 * MUI expects. The values are the same; only the notation differs.
 *
 * That restatement is the cost of using a component library with its own theming system, and the
 * reason `theme.ts` exists only for this styling option. Keep it in step with `globals.css`: the
 * stylesheet still drives anything MUI does not render.
 */
const tokens = {
  light: {
    background: '#ffffff',
    foreground: '#09090b',
    card: '#ffffff',
    muted: '#f4f4f5',
    mutedForeground: '#71717a',
    border: '#e4e4e7',
    accent: '#3b82f6',
    destructive: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
  },
  dark: {
    background: '#09090b',
    foreground: '#fafafa',
    card: '#18181b',
    muted: '#27272a',
    mutedForeground: '#a1a1aa',
    border: '#27272a',
    accent: '#3b82f6',
    destructive: '#b91c1c',
    success: '#22c55e',
    warning: '#f59e0b',
  },
} as const;

export function buildTheme(mode: 'light' | 'dark') {
  const t = tokens[mode];

  return createTheme({
    palette: {
      mode,
      background: { default: t.background, paper: t.card },
      text: { primary: t.foreground, secondary: t.mutedForeground },
      primary: { main: t.accent },
      error: { main: t.destructive },
      success: { main: t.success },
      warning: { main: t.warning },
      divider: t.border,
    },
    shape: {
      // 0.5rem, matching --radius. MUI takes a number of pixels, not a CSS length.
      borderRadius: 8,
    },
    typography: {
      fontFamily: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`,
      button: {
        // MUI shouts by default; the rest of the design language does not.
        textTransform: 'none',
        fontWeight: 500,
      },
    },
  });
}
