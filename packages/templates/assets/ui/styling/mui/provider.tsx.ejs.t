---
to: <%= framework.sourceRoot %>components/providers/ThemeProvider.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { buildTheme } from '@/components/ui/theme';

/**
 * Supplies the MUI theme.
 *
 * Wraps *outside* the store provider — every component below reads theme context, and a provider
 * that reads from another must sit inside it. The generator enforces that ordering through
 * PROVIDER_PRIORITY rather than leaving it to whichever recipe happens to run first.
 *
 * The mode is read from the `dark` class on <html> rather than from a store, because that class
 * is what the other styling systems use too — and the inline script in the document already sets
 * it before first paint. Reading it here keeps MUI in step without coupling this file to whichever
 * state library the project chose.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setMode(root.classList.contains('dark') ? 'dark' : 'light');

    sync();

    // A MutationObserver rather than a one-off read: the theme toggle mutates the class after
    // mount, and without this MUI would keep rendering the mode it saw on the first frame.
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <MuiThemeProvider theme={theme}>
      {/* Normalises browser defaults and applies the palette's background to <body>. */}
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
