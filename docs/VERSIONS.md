# Pinned Versions

Every version here was **verified against the npm registry** on 2026-07-28, not recalled from
memory. Determinism (doc 05 §6) requires that generated output only changes when this file changes.

**Update policy:** Renovate opens PRs against this file and `packages/core/src/versions.ts`.
A version bump is expected to produce golden-file diffs — that diff _is_ the review.

---

## ⚠️ Two constraints that override "use the latest"

### 1. TypeScript is pinned to **6.0.3**, not 7.0.2

`typescript-eslint` declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"` on **every** published
tag (`latest` 8.65.0, `canary` 8.65.1-alpha.8, `rc-v8`). TypeScript 7.0.2 is outside that range, so
adopting it would break type-aware linting across this monorepo _and_ every generated project.

TypeScript 6.0.3 is the newest release inside the supported window. Revisit when typescript-eslint
ships TS 7 support; tracked as a P4 item.

### 2. `next-auth` is pinned to the **v5 beta** (`5.0.0-beta.32`)

`latest` is 4.24.15, but v4 predates the App Router and its Next 16 support is poor. Auth.js v5 is
the App-Router-native line and is the de-facto standard despite the beta tag. Pinned **exactly**
(no `^`) so a beta bump can never arrive unreviewed. Accepted risk, recorded here deliberately.

---

## Runtime

| Tool    | Pinned  | Notes                                                 |
| ------- | ------- | ----------------------------------------------------- |
| Node.js | 22.17.1 | Satisfies Prisma 7's `^20.19 \|\| ^22.12 \|\| >=24.0` |
| npm     | 11.5.1  | Workspaces; no global package manager needed          |

## Toolchain

| Package                | Version   | Notes                                                       |
| ---------------------- | --------- | ----------------------------------------------------------- |
| typescript             | **6.0.3** | Capped by typescript-eslint — see above                     |
| turbo                  | 2.10.7    | v2 schema uses `tasks`, not `pipeline`                      |
| eslint                 | 10.8.0    | Flat config only; `.eslintrc` is no longer read             |
| typescript-eslint      | 8.65.0    |                                                             |
| eslint-config-prettier | 10.1.8    |                                                             |
| prettier               | 3.9.6     |                                                             |
| globals                | 17.8.0    |                                                             |
| vitest                 | 4.1.10    |                                                             |
| @playwright/test       | 1.62.0    | Matches Next 16's peer range `^1.51.1`                      |
| dependency-cruiser     | 18.1.0    | Enforces the no-cycles rule from doc 00 §2                  |
| tsx                    | 4.23.1    |                                                             |
| @types/node            | 22.20.1   | Tracks the Node **22** runtime, not the latest major (26.x) |

## Portal

| Package               | Version                   |
| --------------------- | ------------------------- |
| next                  | 16.2.12                   |
| react / react-dom     | 19.2.8                    |
| @types/react          | 19.2.17                   |
| @types/react-dom      | 19.2.3                    |
| tailwindcss           | 4.3.3                     |
| zustand               | 5.0.14                    |
| react-hook-form       | 7.83.0                    |
| @hookform/resolvers   | 5.5.7                     |
| @tanstack/react-query | 5.101.4                   |
| next-auth             | **5.0.0-beta.32** (exact) |
| @auth/prisma-adapter  | 2.11.3                    |

## Engine & platform

| Package                    | Version | Used by                                  |
| -------------------------- | ------- | ---------------------------------------- |
| zod                        | 4.4.3   | `packages/core` — ProjectSpec            |
| prisma / @prisma/client    | 7.9.1   | `packages/db`                            |
| better-sqlite3             | 13.0.1  | Local dev database                       |
| ts-morph                   | 28.0.0  | `packages/generator` — AST codemods      |
| ejs                        | 6.0.1   | `packages/generator` — template renderer |
| @octokit/rest              | 22.0.1  | `packages/vcs`                           |
| @octokit/auth-app          | 8.2.0   | `packages/vcs` — GitHub App auth         |
| @octokit/plugin-throttling | 11.0.3  | `packages/vcs` — rate limiting           |
| bullmq                     | 5.81.2  | `packages/queue` — P2, when Redis lands  |
| pino                       | 10.3.1  | Structured logging                       |

## Generated-project versions

Versions emitted **into generated projects** live in `packages/core/src/versions.ts` and are
intentionally separate from this monorepo's own dependencies — a generated Fastify service should
not be forced to move because the portal upgraded. Both are Renovate-managed.

| Package                   | Version | Emitted for                    |
| ------------------------- | ------- | ------------------------------ |
| fastify                   | 5.10.0  | `api/runtime/node-ts`          |
| @fastify/swagger          | 9.8.1   | `api/paradigm/rest`            |
| fastify-type-provider-zod | 7.0.0   | `api/paradigm/rest`            |
| zod-to-json-schema        | 3.25.2  | Zod → OpenAPI chain            |
| vite                      | 8.1.5   | `ui/framework/vite-react` (P2) |
| @vitejs/plugin-react      | 6.0.4   | `ui/framework/vite-react` (P2) |
