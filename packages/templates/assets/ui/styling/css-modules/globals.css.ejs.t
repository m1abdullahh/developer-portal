---
to: <%= framework.stylesheetPath %>
---
/*
 * Design tokens.
 *
 * The same token names the Tailwind recipe emits, deliberately: a page module referencing
 * `--muted-foreground` must mean the same thing whichever styling system generated the project.
 * The tokens are the part of the design language that crosses systems; the class names are not.
 *
 * Each styling system emits its own copy rather than sharing one file. A shared stylesheet would
 * couple the systems, so changing a Tailwind token would silently alter a CSS Modules project.
 */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --accent: 217 91% 60%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --ring: 217 91% 60%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 6% 10%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --border: 240 3.7% 15.9%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --destructive: 0 62.8% 45%;
  --success: 142 60% 45%;
}

* {
  box-sizing: border-box;
  border-color: hsl(var(--border));
}

body {
  margin: 0;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.5;
}
