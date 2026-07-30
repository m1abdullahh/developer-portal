---
to: src/routes.tsx
---
import type { RouteObject } from 'react-router';
import { App } from './App';

/**
 * The route table.
 *
 * Next discovers routes from the filesystem; a Vite SPA has no such mechanism, so pages have to
 * be listed. This array is the anchor page modules add to — they emit a component under `pages/`
 * and register it here, rather than each module inventing its own wiring.
 *
 * Marker comments delimit the generated region. Everything between them belongs to the generator;
 * routes you add yourself are safest outside it.
 */
export const routes: RouteObject[] = [
  { index: true, element: <App /> },
  // >>> idp:routes
  // <<< idp:routes
];
