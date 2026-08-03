---
to: <%= framework.sourceRoot %>composables/useUiState.ts
---
type Theme = 'light' | 'dark' | 'system';

/**
 * The companion store for UI preferences.
 *
 * TanStack Query caches *server* state. Theme and sidebar are client state and do not belong in a
 * query cache — the React implementation pairs its QueryClientProvider with a small context store
 * for exactly this reason, and this is that pairing for Vue.
 *
 * Built on Nuxt's own `useState` rather than Pinia: it is SSR-safe, serialised into the payload
 * automatically, and adds no dependency at all. Reach for Pinia when the state grows actions and
 * getters worth naming.
 */
export function useUiState() {
  const theme = useState<Theme>('ui-theme', () => 'system');
  const sidebarOpen = useState('ui-sidebar', () => true);

  function setTheme(next: Theme) {
    theme.value = next;
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  return { theme, sidebarOpen, setTheme, toggleSidebar };
}
