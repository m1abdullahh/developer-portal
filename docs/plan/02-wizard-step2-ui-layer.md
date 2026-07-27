# 02 — Wizard Step 2: UI Layer

**Owner:** Engineer 1 (wizard UI) + Engineer 2 (templates) · **PRD ref:** §3 Step 2
**Phase:** P1 spine = `nextjs-app` + `tailwind-shadcn` + `zustand`; P2 = everything else

Combination space: 3 frameworks × 3 styling × 4 state × 2⁴ module toggles = **576 variants**.
We do not author 576 templates. We author **14 recipes** that compose (see doc 05); this document
specifies what each recipe contributes.

---

## 1. Framework recipes (`ui.framework`)

### 1.1 `nextjs-app` — Next.js App Router (React) · P1

```
app/layout.tsx            root layout, font, providers slot (codemod target)
app/page.tsx              landing
app/(app)/layout.tsx      authenticated shell — sidebar + topbar
app/api/health/route.ts
components/ui/            styling-recipe fills this
lib/env.ts                Zod-validated env access, fails fast at boot
next.config.ts            standalone output when containerised
```

- `output: 'standalone'` whenever `ops.container.strategy !== 'none'` — required for the
  distroless final stage to work without `node_modules`.
- Server Components by default; `'use client'` only where a state recipe requires it.

### 1.2 `vite-react` — Vite + React SPA · P2

```
src/main.tsx, src/App.tsx
src/routes/               React Router v7 file-mirroring layout
vite.config.ts            proxy /api → backend in dev
index.html
nginx.conf                SPA history fallback, used by the container recipe
```

SPA needs a static server in production — the container recipe branches to an nginx-unprivileged
final stage instead of distroless-node.

### 1.3 `nuxt` — Nuxt 3/4 (Vue) · P2

```
app.vue, nuxt.config.ts
pages/, layouts/default.vue, layouts/auth.vue
composables/, plugins/
server/api/health.ts
```

Nuxt triggers the substitution table in doc 00 §5.1–5.2. The wizard relabels state and styling
options the moment Nuxt is selected, with an inline note explaining the Vue equivalent.

---

## 2. Styling recipes (`ui.styling`)

| Recipe            | React (Next/Vite)         | Nuxt                         | Contributes                                                                                                                                                           |
| ----------------- | ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwind-shadcn` | Tailwind v4 + shadcn/ui   | Tailwind v4 + **shadcn-vue** | `globals.css` with CSS-var theme tokens, `components.json`, seed components (Button, Input, Card, Dialog, Table, DropdownMenu, Toast), dark mode via `class` strategy |
| `mui`             | `@mui/material` + Emotion | **Vuetify 3**                | `theme.ts` palette/typography, `ThemeProvider` (codemod-injected into layout), `CssBaseline`, MUI-flavoured variants of every page module                             |
| `css-modules`     | `*.module.css`            | `<style module>`             | Design-token stylesheet (`tokens.css`), `cn()` helper, hand-rolled primitives matching the shadcn API surface                                                         |

**Critical constraint:** every page module (§4) must exist in **all three** styling flavours.
This is the largest single source of template volume in the project. Mitigation: page modules are
authored against a thin internal primitive API (`<Button>`, `<Card>`, `<DataTable>`), and only
those ~8 primitives are re-implemented per styling system. Module _logic_ is shared; only the
primitive layer forks. This turns 3× duplication of every page into 3× duplication of 8 small files.

---

## 3. State recipes (`ui.state`)

| Recipe          | React deps                        | Nuxt substitute                | Contributes                                                                                                  |
| --------------- | --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `zustand`       | `zustand`                         | `pinia`                        | `stores/useAuthStore.ts`, `stores/useUiStore.ts`, persist middleware, devtools in dev                        |
| `redux-toolkit` | `@reduxjs/toolkit`, `react-redux` | `pinia` (module pattern)       | `store/index.ts`, `store/slices/{auth,ui}.ts`, typed `useAppDispatch`/`useAppSelector`, `<Provider>` codemod |
| `react-query`   | `@tanstack/react-query`           | `@tanstack/vue-query`          | `lib/queryClient.ts`, `<QueryClientProvider>` codemod, typed hooks per module, devtools in dev               |
| `context`       | none                              | `provide`/`inject` composables | `context/AuthContext.tsx`, `context/UiContext.tsx`, reducer pattern, no extra dependency                     |

All four inject a provider into the root layout. That injection is an **AST codemod**, not a
template overwrite — otherwise the framework recipe and state recipe would both own `layout.tsx`
and collide. See doc 05 §4.

**Note:** `react-query` is a server-state cache, not a client-state store — orthogonal to the
other three. When `react-query` is selected we also emit a minimal Context-based client store so
the app has both, and the generated README explains the distinction. Choosing "React Query" and
getting no client-state solution at all would be a footgun.

---

## 4. Pre-built page modules (`ui.modules.*`)

Each is an independent recipe; each contributes pages, components, types, mock/live data hooks,
env keys and a README section.

### 4.1 `authLayouts`

Sign-in, sign-up, forgot-password, reset-password, verify-email; split-panel auth layout;
form validation via Zod + RHF (or `vee-validate` for Nuxt); session-aware route guard.
Wires to the API auth middleware when `api.middleware.auth !== 'none'`; otherwise generates
against a clearly-labelled mock adapter with a `TODO(auth)` marker.

### 4.2 `userManagement`

Data table with server-side pagination, sort, filter and column visibility (TanStack Table for
React); create/edit drawer; role assignment; bulk actions; optimistic delete with undo.
**Requires** an API + database. Generates the matching backend CRUD endpoints in the API recipe
so the table is wired to real routes, not stubs.

### 4.3 `stripeBilling`

Plan selection, current subscription card, invoice history, payment-method management, Stripe
Customer Portal redirect, upgrade/downgrade flow.
Contributes to the API layer: `POST /billing/checkout-session`, `POST /billing/portal-session`,
and a signature-verified `POST /webhooks/stripe` handler with idempotency keys.
Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_*`.
Emitted as `.env.example` placeholders only.

### 4.4 `settingsRbac`

Settings shell (profile / organisation / security / notifications tabs), role & permission matrix
editor, audit-log viewer, API-key management.
Ships a shared `permissions.ts` policy definition consumed by **both** UI guards and API
middleware — one definition, two enforcement points, so they cannot drift.

---

## 5. Wizard UI behaviour

- Framework as large radio cards with logo, one-line description, and a "best for" hint.
- Styling and State render as cards **with live substitution labels** when Nuxt is selected —
  e.g. the Zustand card's title becomes "Pinia" with a subtitle _"Vue equivalent of Zustand"_.
- Page modules are checkbox cards; an unmet dependency (doc 00 §5.6) renders the card disabled
  with the reason inline: _"Requires a database — configure Step 3 first."_
  Users can proceed to Step 3, choose a DB, and return to find the card enabled.
- A **"Skip UI layer"** toggle sets `ui = null` for API-only projects, collapsing the step.
- Live preview panel: a small rendered mock of the chosen framework+styling combination so users
  see what they're picking. Static images per combination, not a live sandbox.

---

## 6. Template inventory (P2 completion target)

| Category               | Count                 | Notes                                                  |
| ---------------------- | --------------------- | ------------------------------------------------------ |
| Framework skeletons    | 3                     | next-app, vite-react, nuxt                             |
| Styling primitive sets | 3 × 2 (React/Vue) = 6 | ~8 primitives each                                     |
| State recipes          | 4 × 2 = 8             | React + Vue variants                                   |
| Page modules           | 4                     | Logic shared, primitives injected                      |
| Shared/common          | 1                     | eslint, prettier, tsconfig, gitignore, README composer |
| **Total recipes**      | **22**                | vs. 576 naive combinations                             |

---

## 7. Acceptance criteria

- [ ] Every framework × styling × state combination renders, installs and **builds** (smoke matrix, doc 08)
- [ ] Selecting Nuxt relabels state/styling options and never emits a React dependency
- [ ] Selecting Nuxt + Zustand produces a Pinia project with zero `zustand` references
- [ ] Each page module renders correctly in all three styling systems
- [ ] Provider injection is order-correct with multiple providers (Query outside Redux outside Theme)
- [ ] Module dependency gates enable/disable live as Step 3 changes
- [ ] `ui = null` produces a valid API-only project with no frontend artefacts
- [ ] Generated project passes its own `lint` and `typecheck` with zero warnings
