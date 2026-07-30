---
to: <%= framework.sourceRoot %>stores/uiSlice.ts
---
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'light' | 'dark' | 'system';

export interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
}

const STORAGE_KEY = '<%= spec.meta.slug %>-ui';

/**
 * Reads the persisted theme.
 *
 * Guarded on `window` because this module is evaluated on the server too, where touching
 * localStorage throws. Returning the default there is correct: the inline script in the layout
 * applies the real theme before first paint, so there is no flash to fix here.
 */
function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    // Private browsing modes can throw on access rather than returning null.
    return 'system';
  }
}

const initialState: UiState = {
  theme: initialTheme(),
  // Deliberately not persisted: restoring a sidebar from another session on a different screen
  // size is more disorienting than helpful.
  sidebarOpen: true,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, action.payload);
        } catch {
          // A failed write is not worth interrupting a theme change for.
        }
      }
    },
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
  },
});

export const { setTheme, toggleSidebar } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
