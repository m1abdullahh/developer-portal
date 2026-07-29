---
to: components/providers/StoreProvider.tsx
---
'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface UiContextValue {
  theme: Theme;
  sidebarOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

const STORAGE_KEY = '<%= spec.meta.slug %>-ui';

/**
 * Client UI state, as a companion to TanStack Query.
 *
 * Query is a *server*-state cache — it is deliberately not a general store, and using it for
 * theme or sidebar state means keeping client-only values in a cache that can be invalidated or
 * garbage-collected underneath you. This context covers the small amount of genuinely local
 * state instead, with no extra dependency.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Read after mount, not during render: touching localStorage while rendering on the server
  // throws, and doing it during the first client render causes a hydration mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') setThemeState(stored);
    } catch {
      // Private browsing can throw on access.
    }
  }, []);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle(
      'dark',
      theme === 'dark' || (theme === 'system' && prefersDark),
    );
  }, [theme]);

  const value = useMemo<UiContextValue>(
    () => ({
      theme,
      sidebarOpen,
      setTheme: (next) => {
        setThemeState(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // A failed write should not block a theme change.
        }
      },
      toggleSidebar: () => setSidebarOpen((open) => !open),
    }),
    // Without useMemo every consumer re-renders on any parent render, because the value would be
    // a new object each time.
    [theme, sidebarOpen],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  // A named error beats "cannot read property 'theme' of null" three frames deep.
  if (!value) throw new Error('useUi must be used inside <StoreProvider>.');
  return value;
}
