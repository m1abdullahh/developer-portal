---
to: components/providers/StoreProvider.tsx
---
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
}

type UiAction =
  | { type: 'setTheme'; theme: Theme }
  | { type: 'toggleSidebar' }
  | { type: 'hydrate'; state: Partial<UiState> };

const STORAGE_KEY = '<%= spec.meta.slug %>-ui';

function reducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'toggleSidebar':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'hydrate':
      return { ...state, ...action.state };
  }
}

/*
 * Two contexts, not one.
 *
 * State and dispatch are split so a component that only dispatches — a theme toggle button, say —
 * does not re-render every time the state it never reads happens to change. With a single
 * context, every consumer re-renders on every update, which is the usual reason "just use
 * Context" acquires a reputation for being slow.
 */
const StateContext = createContext<UiState | null>(null);
const DispatchContext = createContext<Dispatch<UiAction> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { theme: 'system', sidebarOpen: true });

  // Read after mount. localStorage does not exist on the server, and reading it during the first
  // client render would produce markup that disagrees with what the server sent.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        dispatch({ type: 'hydrate', state: { theme: stored } });
      }
    } catch {
      // Private browsing modes can throw on access rather than returning null.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, state.theme);
    } catch {
      // A failed write should not block a theme change.
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle(
      'dark',
      state.theme === 'dark' || (state.theme === 'system' && prefersDark),
    );
  }, [state.theme]);

  // `state` is already a stable reference between updates, so this memo only guards against the
  // object identity changing when an unrelated parent re-renders.
  const value = useMemo(() => state, [state]);

  return (
    <StateContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useUiState(): UiState {
  const state = useContext(StateContext);
  if (!state) throw new Error('useUiState must be used inside <StoreProvider>.');
  return state;
}

export function useUiDispatch(): Dispatch<UiAction> {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) throw new Error('useUiDispatch must be used inside <StoreProvider>.');
  return dispatch;
}

/** Convenience wrapper for the common case, with a stable callback identity. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const { theme } = useUiState();
  const dispatch = useUiDispatch();
  const setTheme = useCallback((next: Theme) => dispatch({ type: 'setTheme', theme: next }), [
    dispatch,
  ]);
  return { theme, setTheme };
}
