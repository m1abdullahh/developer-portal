---
to: <%= framework.sourceRoot %>stores/useUiStore.ts
---
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
}

/**
 * UI preferences, persisted to localStorage.
 *
 * `partialize` deliberately excludes `sidebarOpen`: restoring a sidebar state from a previous
 * session on a different screen size is disorienting, whereas theme is a genuine preference.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarOpen: true,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: '<%= spec.meta.slug %>-ui',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
