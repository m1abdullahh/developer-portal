/**
 * Provider nesting order.
 *
 * Multiple state/styling recipes each need to wrap the app's `{children}`, and none of them
 * owns layout.tsx. Nesting order is not cosmetic — a provider that reads from another must sit
 * *inside* it, so the wrong order produces a runtime "must be used within a Provider" crash
 * that looks nothing like a generator bug.
 *
 * Lower number = further outside. Bands are spaced so a new recipe can slot between two
 * existing ones without renumbering anything.
 */
export const PROVIDER_PRIORITY = {
  /** Outermost: must catch errors thrown by every provider below it. */
  errorBoundary: 10,
  /** Themes supply CSS context that everything visual depends on. */
  theme: 20,
  /** Server-state cache. Auth below it may issue queries. */
  query: 30,
  /** Client store. Auth state is commonly kept here. */
  store: 40,
  /** Reads from store and/or query, so it must be inside both. */
  auth: 50,
  /** Innermost: toasts are triggered by everything above. */
  toast: 60,
} as const;

export interface ProviderWrap {
  /** JSX component name, e.g. `QueryClientProvider`. */
  component: string;
  /** Raw JSX attributes, e.g. `client={queryClient}`. */
  props?: string;
  /** See PROVIDER_PRIORITY. Lower is further outside. */
  priority: number;
  /** Import to add for the component. */
  import: {
    module: string;
    named?: string[];
    defaultImport?: string;
  };
  /** Statements to insert above the component, e.g. `const queryClient = new QueryClient();`. */
  preamble?: string[];
}
