---
to: src/main.tsx
---
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { Root } from './providers/Root';
import { routes } from './routes';
import './globals.css';

const container = document.getElementById('root');
// A missing #root means index.html and this file disagree. Failing with that sentence beats
// "Cannot read properties of null", which sends you looking at React instead of the HTML.
if (!container) throw new Error('No #root element found in index.html.');

/**
 * Providers, rendered once around every route.
 *
 * The glue lives here rather than inside `Root` so that `Root` stays a pure `{children}` wrapper —
 * that expression is the anchor the generator wraps providers around, and replacing it with an
 * `<Outlet />` would leave nothing to wrap.
 */
function Layout() {
  return (
    <Root>
      <Outlet />
    </Root>
  );
}

/*
 * Providers sit *inside* the layout route, not around <RouterProvider>.
 *
 * Wrapping the router would remount every provider on each navigation, discarding store and query
 * state as the user moves between pages. As a layout route this renders once.
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: routes,
  },
]);

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
