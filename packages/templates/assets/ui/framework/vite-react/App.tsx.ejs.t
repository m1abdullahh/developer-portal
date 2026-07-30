---
to: src/App.tsx
---
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';

export function App() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold"><%= spec.meta.projectName %></h1>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        <%= spec.meta.description ?? `Generated for ${spec.meta.clientName}.` %>
      </p>

      <Card className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold">This is a Vite SPA</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          No server rendering. `npm run build` emits static assets to `dist/`, which the container
          image serves with nginx.
        </p>
        <Button>A styled button</Button>
      </Card>
    </main>
  );
}
