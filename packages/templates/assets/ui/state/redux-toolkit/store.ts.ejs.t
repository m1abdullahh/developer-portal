---
to: stores/store.ts
---
import { configureStore } from '@reduxjs/toolkit';
import { uiReducer } from './uiSlice';

/**
 * The store factory.
 *
 * A factory rather than a module singleton, deliberately. A singleton store is shared across
 * requests on the server, so one user's state can leak into another's render — the classic
 * Next.js/Redux mistake. `StoreProvider` calls this once per client instance instead.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      ui: uiReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
