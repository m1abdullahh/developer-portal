---
to: tsconfig.json
---
{
  // Nuxt generates the real configuration — compiler options, path aliases and the types for
  // every auto-imported composable — into .nuxt/ when `nuxt prepare` runs. Extending it rather
  // than restating it is what keeps `~/`, `#app` and `useRuntimeConfig()` resolving; a
  // hand-written config here would drift from whatever Nuxt actually does.
  //
  // That directory is gitignored, which is why `postinstall` runs `nuxt prepare`: on a fresh
  // clone this file points at something that does not exist yet.
  "extends": "./.nuxt/tsconfig.json"
}
