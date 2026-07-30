---
to: <%= framework.sourceRoot %>components/providers/StoreProvider.tsx
---
'use client';

import { useEffect, type ReactNode } from 'react';
import { useUiStore } from '@/stores/useUiStore';

/**
 * Applies persisted UI state to the document.
 *
 * Zustand needs no context provider — the store is a module singleton. This component exists
 * only to bridge store state to the DOM (the `dark` class) after hydration.
 *
 * The effect runs after mount rather than during render because reading localStorage during SSR
 * produces a server/client mismatch; `suppressHydrationWarning` on <html> covers the one frame
 * before this lands.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    root.classList.toggle('dark', isDark);
  }, [theme]);

  return <>{children}</>;
}
