---
to: <%= framework.stylesheetPath %>
---
@import 'tailwindcss';

/*
 * Design tokens as CSS custom properties rather than Tailwind config values.
 *
 * This is what lets the theme switch at runtime: a `dark` class on <html> re-points the same
 * variables, so no component needs a `dark:` variant for colour. Components reference
 * `bg-[hsl(var(--background))]` and stay theme-agnostic.
 *
 * The names match every other styling option this generator emits, so `--muted-foreground` means
 * the same thing whichever one produced the project. Every token below is referenced by at least
 * one component, and every token a component references is declared here — `token-contract.test.ts`
 * checks both directions, after four of them turned out to be missing from the React set.
 */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --accent: 217 91% 60%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --success: 142 71% 45%;
    --warning: 38 92% 50%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 6% 10%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --ring: 240 4.9% 83.9%;
  }

  * {
    border-color: hsl(var(--border));
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}
