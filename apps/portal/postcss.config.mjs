/**
 * Tailwind CSS v4 runs as a PostCSS plugin.
 *
 * Without this file the build still SUCCEEDS — `@import 'tailwindcss'` is left as an ordinary
 * CSS import, so you get the custom properties from globals.css and not one utility class.
 * Every `className` silently does nothing and the page renders unstyled, with no error anywhere.
 *
 * That exact failure was hit once in the generated Next.js template; this is the same fix,
 * applied to the portal's own build.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
