---
to: <%= framework.sourceRoot %>plugins/vuetify.ts
---
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

/**
 * Vuetify, installed as a Nuxt plugin.
 *
 * This is what the framework contract means by `providerInstall: 'nuxt-plugin'`. React wraps the
 * application in a `<ThemeProvider>` that a codemod inserts around `{children}`; Vue has nothing
 * to wrap — a file in `app/plugins/` is picked up by Nuxt's own convention and runs before the app
 * mounts. Nothing edits `app.vue` at all.
 *
 * ── The tokens are restated, not referenced ─────────────────────────────────
 * Vuetify does not read CSS custom properties, so the palette below repeats what `globals.css`
 * declares. That duplication is the price of a component library with its own theming system, and
 * it is the same cost MUI imposes in the React family. Keep the two in step: the stylesheet still
 * drives everything Vuetify does not render.
 */
const tokens = {
  light: {
    background: '#ffffff',
    surface: '#ffffff',
    'on-surface': '#09090b',
    primary: '#3b82f6',
    error: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
  },
  dark: {
    background: '#09090b',
    surface: '#18181b',
    'on-surface': '#fafafa',
    primary: '#3b82f6',
    error: '#b91c1c',
    success: '#22c55e',
    warning: '#f59e0b',
  },
};

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    // Registered explicitly rather than left to auto-import: `vite-plugin-vuetify` tree-shakes
    // against what the templates actually reference, and the wrappers in components/ui are the
    // only place a Vuetify component appears.
    components,
    directives,
    theme: {
      defaultTheme: 'light',
      themes: {
        light: { dark: false, colors: tokens.light },
        dark: { dark: true, colors: tokens.dark },
      },
    },
    defaults: {
      // Vuetify shouts by default; the rest of the design language does not.
      VBtn: { style: 'text-transform: none; letter-spacing: normal;' },
    },
  });

  nuxtApp.vueApp.use(vuetify);
});
