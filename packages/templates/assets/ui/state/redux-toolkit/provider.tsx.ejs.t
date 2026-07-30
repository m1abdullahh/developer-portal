---
to: <%= framework.sourceRoot %>components/providers/StoreProvider.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useEffect, useRef, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/stores/store';
import { useAppSelector } from '@/stores/hooks';

/**
 * Creates the store once per client and applies persisted UI state to the document.
 *
 * The ref matters: `makeStore()` in the component body would build a new store on every render,
 * discarding all state. A ref creates it exactly once, on the client, which is also what keeps
 * server renders from sharing a store between requests.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  storeRef.current ??= makeStore();

  return (
    <Provider store={storeRef.current}>
      <ThemeEffect />
      {children}
    </Provider>
  );
}

/**
 * Bridges theme state to the DOM.
 *
 * A separate component because it calls `useAppSelector`, which requires a Provider above it —
 * reading the store in `StoreProvider` itself would throw.
 */
function ThemeEffect() {
  const theme = useAppSelector((state) => state.ui.theme);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  return null;
}
