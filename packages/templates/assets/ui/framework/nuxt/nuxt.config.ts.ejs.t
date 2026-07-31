---
to: nuxt.config.ts
---
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  /*
   * Pins the behaviour of Nitro and Nuxt's own defaults to a known date.
   *
   * Without it Nuxt adopts whatever its current defaults are at install time, so two installs of
   * the same lockfile weeks apart can behave differently. Raise it deliberately, after reading the
   * upgrade notes — that is the whole point of the field.
   *
   * A literal, not the generation date. Stamping "today" would give two projects scaffolded a
   * week apart different Nuxt behaviour by accident, which is precisely what this field exists to
   * prevent. It moves when the generator's pinned Nuxt version moves.
   */
  compatibilityDate: '2026-07-31',

  // Off in a generated project: devtools attach an inspector to every dev request, and a team
  // that wants them can turn them on in one line.
  devtools: { enabled: false },

  typescript: {
    strict: true,
    // Type checking runs as its own `npm run typecheck` step rather than inside `nuxt dev`.
    // Coupling them makes every hot reload wait on a full check of the project.
    typeCheck: false,
  },

  /*
   * Nuxt modules — how a Vue project installs what React installs by wrapping a provider.
   *
   * Pinia is a module rather than a `<PiniaProvider>`; there is nothing to wrap. Recipes add
   * themselves here instead of editing a component, which is why the framework contract reports
   * `providerInstall: 'nuxt-plugin'`.
   */
  modules: [
    // >>> idp:nuxt-modules
    // <<< idp:nuxt-modules
  ],

  css: [
    // >>> idp:nuxt-css
    // <<< idp:nuxt-css
  ],

  /*
   * Runtime config, not `process.env` reads scattered through components.
   *
   * Anything under `public` is serialised into the page and readable by anyone — it is the Nuxt
   * equivalent of a `NEXT_PUBLIC_` prefix, and it must never hold a secret. Values are overridden
   * at runtime by `NUXT_PUBLIC_*` environment variables, so the built output is environment
   * agnostic and the same image runs in staging and production.
   */
  runtimeConfig: {
    public: {
      // >>> idp:nuxt-runtime-public
      // <<< idp:nuxt-runtime-public
    },
  },
});
