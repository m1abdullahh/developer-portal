# 05 — Generator Engine

**Owner:** Engineer 2 (Generator & Stack Lead) · **PRD ref:** §2 deliverables · **Phase:** P1

The engine that turns a `ProjectSpec` into a file tree. This is the technical core of the product;
everything else is a UI over it. The central problem is **composition**: 576 UI variants × 1,152 API
variants cannot be authored as templates, so they must be _composed_ from a small set of recipes.

---

## 1. Why not the Hygen CLI directly

The PRD names "Hygen/Plop". We keep Hygen's **template format** (`.ejs.t` with frontmatter) because
it is good and familiar, but drive it with our own in-process renderer.

| Hygen CLI (shelling out)                                         | Our renderer                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Writes straight to disk                                          | Renders to an in-memory tree — merge/codemod/verify run before anything is written |
| Errors surface as exit codes + stderr text                       | Typed errors with template path and line                                           |
| Hard to stream progress into the portal                          | Emits structured stage events for SSE                                              |
| Each generator invocation is independent — no cross-recipe merge | Central merge phase resolves collisions                                            |
| Needs a subprocess in the worker container                       | Pure library call                                                                  |

The in-memory tree is what makes the merge and verify stages possible at all, and those are what
make 576 combinations tractable.

---

## 2. The Recipe model

```ts
export interface Recipe {
  id: string; // 'ui.framework.nextjs-app'
  phase: RecipePhase; // 'base' | 'feature' | 'integration' | 'finalize'
  appliesTo(spec: ResolvedSpec): boolean;
  requires?: string[]; // recipe ids that must run first
  conflicts?: string[]; // recipe ids that must not coexist

  files?(ctx: RecipeContext): Promise<FileOp[]>;
  packageJson?(ctx: RecipeContext): PackageDelta; // deps, devDeps, scripts
  pyProject?(ctx: RecipeContext): PyProjectDelta;
  goMod?(ctx: RecipeContext): GoModDelta;
  env?(ctx: RecipeContext): EnvVar[]; // key, example, required, description
  codemods?(ctx: RecipeContext): CodemodOp[];
  readme?(ctx: RecipeContext): ReadmeSection;
  postInstall?(ctx: RecipeContext): Command[]; // e.g. `prisma generate`
}
```

**Phase ordering** guarantees determinism:

| Phase         | Contains                                                                                     | Rule                                                       |
| ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `base`        | Framework/runtime skeletons                                                                  | Exactly one per layer; owns the root files                 |
| `feature`     | Styling, state, ORM, middleware, page modules                                                | Many; may add files, never overwrite `base` files          |
| `integration` | Cross-layer wiring (typed client for tRPC, shared `permissions.ts`, docker-compose assembly) | Runs after all features so it can see the full selection   |
| `finalize`    | README composition, `.env.example`, `.gitignore`, license, formatting                        | Last; consumes contributions accumulated by earlier phases |

Within a phase, recipes are sorted by `id` after topological sort on `requires`. Deterministic
ordering is non-negotiable — golden-file tests depend on byte-identical output across runs.

## 3. Merge strategies

Collisions are normal and expected: five recipes all want to add dependencies to `package.json`.

| File                        | Strategy                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`              | Deep merge. Dependency version conflict → highest semver wins, and a `Diagnostic` is recorded. Script key conflict → **hard error** (ambiguous intent, must be fixed in the recipe) |
| `pyproject.toml` / `go.mod` | Structured merge of dependency tables                                                                                                                                               |
| `.env.example`              | Union by key, grouped by contributing recipe with header comments                                                                                                                   |
| `tsconfig.json`             | Deep merge; `paths` and `include` arrays union'd and de-duplicated                                                                                                                  |
| `docker-compose.yml`        | Merge under `services:`; port-collision detection with auto-reassignment                                                                                                            |
| `.gitignore`                | Line union, sorted, de-duplicated                                                                                                                                                   |
| `README.md`                 | Section assembly in fixed order from each recipe's `readme()` contribution                                                                                                          |
| Helm `values.yaml`          | Deep YAML merge                                                                                                                                                                     |
| Any other identical path    | **Hard error.** Two recipes owning one file is a design bug, not something to silently resolve                                                                                      |

Every merge decision is recorded in a `MergeReport` attached to the job, surfaced in the portal's
job detail view. Silent merges are how generators become un-debuggable.

## 4. AST codemods

Some wiring cannot be templated because multiple recipes must edit **one** file. Provider injection
into `layout.tsx` is the canonical case: framework recipe owns the file, and 1–4 other recipes need
to wrap its children.

### 4.1 TypeScript / JavaScript — `ts-morph`

| Op                   | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `addImport`          | Idempotent; merges named imports into an existing declaration              |
| `wrapJsxChildren`    | Wrap `{children}` in a provider, respecting a declared nesting priority    |
| `addToArray`         | Push into a config array (Vite plugins, Next config, ESLint extends)       |
| `addObjectProperty`  | Insert a config key without clobbering siblings                            |
| `registerMiddleware` | Insert `app.register(...)` into the Fastify bootstrap in the correct order |
| `addRoute`           | Register a router in the route index                                       |
| `addExport`          | Re-export from a barrel file                                               |

**Provider nesting priority** (lower number = outermost) prevents the classic bug where a store
provider ends up inside the component that reads it:

```
10 ErrorBoundary · 20 ThemeProvider · 30 QueryClientProvider
40 ReduxProvider · 50 AuthProvider · 60 ToastProvider
```

Every op is **idempotent** — running the codemod twice produces the same result. This is verified
by a test that applies each codemod set twice and asserts identical output.

### 4.2 Python / Go / YAML — marker anchors

No mature Node-side AST writer exists for Python or Go, so those use anchor comments emitted by the
base recipe:

```python
# >>> idp:middleware:imports
# <<< idp:middleware:imports
```

Injection is line-based between markers, idempotent by content check, and the verify stage fails
the job if any expected marker is missing (a base-template edit that drops a marker would otherwise
silently produce a project with no middleware registered).

## 5. Template authoring conventions

```
packages/templates/
├── ui/framework/nextjs-app/ …
├── ui/styling/tailwind-shadcn/{react,vue}/ …
├── ui/state/zustand/{react,vue}/ …
├── ui/modules/user-management/{logic,tailwind,mui,css-modules}/ …
├── api/runtime/node-ts/ …
├── api/middleware/rate-limit/{node,python,go}/ …
├── ops/container/{node,vite,python,go}/ …
├── ops/k8s/helm/ …
└── common/ …
```

Hygen-style frontmatter:

```
---
to: src/stores/use<%= h.pascal(name) %>Store.ts
skip_if: <%= !spec.ui %>
inject_after: false
---
```

Rules: templates are pure (no side effects, no network, no `Date.now()`), every value comes from
`ctx`, `<%=` escaping is default and `<%-` requires an allowlist entry, and binary/static files use
a `passthrough/` directory that bypasses EJS entirely.

## 6. Determinism

Non-determinism silently breaks golden-file testing, so it is engineered out:

- No `Date.now()`, `Math.random()`, or `os.hostname()` in templates. Timestamps and UUIDs come from
  `ctx.clock` / `ctx.ids`, injected and frozen in tests.
- Object key order is stabilised before serialisation.
- Dependency versions come from a **pinned manifest** (`packages/core/src/versions.ts`), not a live
  registry lookup at generation time. Renovate updates that manifest via PR, which is exactly when
  golden files should change.
- File emission order is sorted.

## 7. Public API

```ts
const result = await generate(spec, {
  vcs: new FilesystemDriver('/out'),
  onProgress: (e: StageEvent) => void,   // streamed to the portal over SSE
  dryRun: false,
});
// → { files, diagnostics, mergeReport, durationMs, postInstall }
```

Also exposed as a CLI (PRD: "CLI Runner") for local iteration without the portal:

```
idp generate --spec ./spec.json --out ./out
idp generate --interactive          # same wizard questions in the terminal
idp validate --spec ./spec.json
idp list-recipes --spec ./spec.json # shows which recipes a spec activates
```

## 8. Performance target

Core metric is _under 10 minutes_ end-to-end. Generation itself should be a rounding error:

| Stage                     | Budget     |
| ------------------------- | ---------- |
| resolve + plan            | < 50 ms    |
| render (~200 files)       | < 500 ms   |
| merge + codemod           | < 1 s      |
| format                    | < 2 s      |
| verify                    | < 500 ms   |
| **Generation total**      | **< 5 s**  |
| GitHub repo create + push | < 30 s     |
| **Job total (excl. CI)**  | **< 60 s** |

The remaining budget belongs to the user filling in the wizard and to the generated repo's first CI run.

## 9. Acceptance criteria

- [ ] Same spec generates byte-identical output across 100 consecutive runs
- [ ] Every codemod is idempotent (verified by double-application test)
- [ ] Two recipes owning one file raises a hard error, not a silent overwrite
- [ ] `MergeReport` lists every dependency-version resolution
- [ ] Unrendered `<%` or `%>` anywhere in output fails the verify stage
- [ ] Provider nesting order is correct for every state × styling combination
- [ ] A missing marker anchor in a Python/Go template fails the job with a clear message
- [ ] Generation of the largest possible spec completes in < 5 s
- [ ] CLI produces output identical to the portal for the same spec
