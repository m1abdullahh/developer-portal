---
to: postcss.config.mjs
---
/**
 * Tailwind CSS v4 runs as a PostCSS plugin.
 *
 * Without this file the build still SUCCEEDS — `@import 'tailwindcss'` is left as an ordinary
 * CSS import, so you get the custom properties from globals.css and not one utility class.
 * Every `className` silently does nothing, and the page renders unstyled with no error anywhere.
 *
 * That failure mode is why the smoke matrix asserts on generated CSS content rather than on
 * exit codes alone (doc 08 §3).
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
