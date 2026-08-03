---
to: <%= framework.sourceRoot %>plugins/vue-query.ts
---
import { VueQueryPlugin, QueryClient, hydrate, dehydrate } from '@tanstack/vue-query';

/**
 * TanStack Query for Vue.
 *
 * Installed as a Nuxt plugin — `providerInstall: 'nuxt-plugin'` in the framework contract. The
 * React implementation renders a `<QueryClientProvider>` that a codemod wraps around
 * `{children}`; nothing wraps anything here.
 *
 * ── Why the client is created inside the plugin ─────────────────────────────
 * A module-level QueryClient would be shared by every request the server handles, so one user's
 * cached data could be serialised into another user's page. Creating it here gives each request
 * its own — the same reason React's version creates it in a `useState` initialiser rather than at
 * module scope.
 *
 * ── The hydration dance ─────────────────────────────────────────────────────
 * Without it, everything fetched during server rendering is fetched again the moment the page
 * becomes interactive: the markup arrives populated, then blanks and refills. `dehydrate` snapshots
 * the server's cache into the payload and `hydrate` restores it on the client, so the first render
 * after hydration is a cache hit.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // A minute, not zero. The default refetches on every mount, which for a page that
        // navigates back and forth means a request per visit for data that has not changed.
        staleTime: 60_000,
        retry: 1,
      },
    },
  });

  const state = useState<unknown>('vue-query');

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient: client });

  if (import.meta.server) {
    nuxtApp.hooks.hook('app:rendered', () => {
      state.value = dehydrate(client);
    });
  }

  if (import.meta.client) {
    nuxtApp.hooks.hook('app:created', () => {
      hydrate(client, state.value);
    });
  }
});
