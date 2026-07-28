---
to: app/page.tsx
---
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">
        <%= spec.meta.projectName %>
      </h1>
      <p className="mt-2 text-sm opacity-70"><%= spec.meta.clientName %></p>
<% if (spec.meta.description) { -%>
      <p className="mt-6"><%= spec.meta.description %></p>
<% } -%>
      <p className="mt-6 text-sm opacity-70">
        Scaffolded by the Internal Developer Portal. Replace this page to get started.
      </p>
    </main>
  );
}
