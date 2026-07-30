---
to: <%= framework.stylesheetPath %>
---
/*
 * Minimal, because MUI's CssBaseline does the resetting and the theme carries the palette.
 *
 * This file still has to exist: the framework entry point imports it unconditionally, so its
 * absence breaks the build rather than merely leaving the page unstyled.
 *
 * The `dark` class is the cross-system signal for colour mode — the same class the Tailwind and
 * CSS Modules projects toggle. ThemeProvider observes it and rebuilds the MUI theme, which is how
 * the theme toggle keeps working without this styling option knowing about the state library.
 */
:root {
  color-scheme: light;
}

.dark {
  color-scheme: dark;
}

html,
body {
  padding: 0;
  margin: 0;
}
