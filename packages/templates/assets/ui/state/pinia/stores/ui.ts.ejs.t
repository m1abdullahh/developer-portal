---
to: <%= framework.sourceRoot %>stores/ui.ts
---
import { defineStore } from 'pinia';

type Theme = 'light' | 'dark' | 'system';

/**
 * UI preferences.
 *
 * A setup store — the function form — rather than the options form. It reads like a composable,
 * which is what a Vue developer already knows, and it is the shape the Pinia docs lead with. The
 * options form exists mainly for projects migrating from Vuex.
 *
 * This one store is what BOTH the Zustand and the Redux Toolkit wizard options produce (doc 00
 * §5.1). Vue has a single idiomatic store; inventing a second, more ceremonious one to mirror
 * Redux's slice pattern would ship a worse project purely to honour a table row.
 */
export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>('system');
  const sidebarOpen = ref(true);

  function setTheme(next: Theme) {
    theme.value = next;
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  /*
   * Persistence, without pinia-plugin-persistedstate.
   *
   * `import.meta.client` is the guard that matters: this store is instantiated during server
   * rendering too, where `localStorage` does not exist and touching it throws. Nuxt replaces the
   * flag at build time, so the whole block is removed from the server bundle rather than skipped
   * at runtime.
   *
   * Only `theme` is persisted. Restoring a sidebar state from a previous session on a different
   * screen size is disorienting; a theme is a genuine preference.
   */
  if (import.meta.client) {
    const saved = localStorage.getItem('<%= spec.meta.slug %>-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') theme.value = saved;

    watch(theme, (next) => localStorage.setItem('<%= spec.meta.slug %>-theme', next));
  }

  return { theme, sidebarOpen, setTheme, toggleSidebar };
});
