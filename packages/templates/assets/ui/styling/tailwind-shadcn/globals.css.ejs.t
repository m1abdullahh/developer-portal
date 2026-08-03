---
to: <%= framework.stylesheetPath %>
---
@import 'tailwindcss';

/*
 * Design tokens as CSS custom properties rather than Tailwind config values.
 *
 * This is what lets the theme switch at runtime: a `dark` class on <html> re-points the same
 * variables, so no component needs a `dark:` variant for colour. Components reference
 * `bg-[var(--background)]` and stay theme-agnostic.
 */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;

    /*
     * These four were referenced by the components long before they were declared here.
     *
     * An undefined custom property makes `hsl(var(--card))` an invalid value, and the browser
     * drops the whole declaration — so Dialog rendered with no background over its own backdrop
     * and Badge's success, warning and accent tones lost their fill entirely. Nothing failed:
     * the build succeeded, the page booted, and a transparent badge reads as "minimal" rather
     * than broken. `token-contract.test.ts` now checks every var() against what is declared.
     */
    --card: 0 0% 100%;
    --accent: 217 91% 60%;
    --success: 142 71% 45%;
    --warning: 38 92% 50%;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --ring: 240 4.9% 83.9%;

    /* Only the ones that actually differ in dark mode. Accent, success and warning are chosen to
       hold their contrast against both backgrounds, so repeating them would be noise. */
    --card: 240 6% 10%;
  }

  * {
    border-color: hsl(var(--border));
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-feature-settings:
      'rlig' 1,
      'calt' 1;
  }
}
