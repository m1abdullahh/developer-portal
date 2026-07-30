---
to: src/providers/Root.tsx
---
import type { ReactNode } from 'react';

/**
 * Where every provider is composed.
 *
 * `main.tsx` renders `<App />` directly, which leaves nowhere for a state or styling recipe to
 * insert a provider. This component exists to be that place: it renders `{children}` exactly once,
 * and the generator wraps that expression rather than editing the entry point.
 *
 * With no providers selected it is a pass-through, which is why it looks pointless in a bare
 * project and is load-bearing in every other one.
 */
export function Root({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
