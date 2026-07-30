---
to: index.html
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><%= spec.meta.projectName %></title>
    <%# Applies the stored theme before first paint. A React effect necessarily runs after the
        first paint, so without this every dark-mode user sees a flash of light on every load. -%>
    <script>
      try {
        var stored = localStorage.getItem('<%= spec.meta.slug %>-ui');
        var dark = stored
          ? stored === 'dark'
          : matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', dark);
      } catch (e) {}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <%# Vite requires the entry as a module script here — it is the build's only entry point,
        not a convention it discovers. -%>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
