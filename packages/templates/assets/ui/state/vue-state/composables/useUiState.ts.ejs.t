---
to: <%= framework.sourceRoot %>composables/useUiState.ts
---
type Theme = 'light' | 'dark' | 'system';

/**
 * Shared UI state with no dependency whatsoever.
 *
 * The Vue answer to React's Context option (doc 00 §5.1 calls it "provide/inject composables").
 * Nuxt's `useState` is the better form of that: it is a shared ref keyed by name, SSR-safe, and
 * serialised into the payload so the client picks up exactly what the server rendered.
 *
 * `provide`/`inject` would work and is closer to React Context literally, but it requires a
 * component to provide from — reintroducing the wrapper this framework has no need for.
 *
 * The zero-dependency claim is the entire reason to pick this option: nothing here imports
 * anything. Everything used is a Nuxt auto-import.
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
