---
to: <%= framework.stylesheetPath %>
---
/*
 * Design tokens.
 *
 * The same custom-property names every styling option emits, so `--muted-foreground` means the
 * same thing whichever option generated this project. A `dark` class on <html> re-points them,
 * which is why no component below carries a dark-mode variant of its own.
 *
 * Registered in nuxt.config.ts's `css` array rather than imported by a component — Nuxt loads it
 * once for the whole application, before any component renders.
 */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 4%;
  --card: 0 0% 100%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 46%;
  --border: 240 6% 90%;
  --ring: 217 91% 60%;
  --accent: 217 91% 60%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --card: 240 6% 10%;
  --muted: 240 4% 16%;
  --muted-foreground: 240 5% 65%;
  --border: 240 4% 16%;
  --accent: 217 91% 60%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 98%;
}

html {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
}

body {
  margin: 0;
}
