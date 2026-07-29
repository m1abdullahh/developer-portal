---
to: .github/workflows/ci.yml
---
name: CI

on:
  pull_request:
    branches: [<%= spec.meta.repo.defaultBranch %>]
  push:
    branches: [<%= spec.meta.repo.defaultBranch %>]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
<% if (spec.ui) { -%>
  web:
    name: Web
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: <%= spec.api ? 'apps/web' : '.' %>
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      # A freshly scaffolded repository has no lockfile — one is produced by the first
      # `npm install` and committed by you. Until then `npm ci` cannot run, and neither can
      # setup-node's npm cache, which fails the job outright when its path does not resolve.
      # This install prefers `npm ci` the moment a lockfile exists, so CI gets stricter on its
      # own once you commit one.
      - name: Install
        run: |
          if [ -f package-lock.json ]; then npm ci; else npm install; fi
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test --if-present
      - run: npm run build
<% } -%>
<% if (spec.api) { -%>
  api:
    name: API
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: <%= spec.ui ? 'apps/api' : '.' %>
<% if (spec.api.database === 'postgres') { -%>
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        ports: ['5432:5432']
        # Without a health check the job races the database and fails intermittently on the
        # first connection — the classic flaky CI failure.
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
<% } -%>
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      # See the note in the web job: no lockfile exists until your first `npm install`, so
      # `npm ci` and setup-node's cache cannot be used on the scaffold commit.
      - name: Install
        run: |
          if [ -f package-lock.json ]; then npm ci; else npm install; fi
<% if (spec.api.orm === 'prisma') { -%>
      - run: npx prisma generate
      - name: Apply migrations
        run: npx prisma migrate deploy
<% } -%>
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test --if-present
      - run: npm run build
<% } -%>

<% if (spec.ops.container.strategy !== 'none') { -%>
  containers:
    name: Containers
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Lint Dockerfiles
        uses: hadolint/hadolint-action@v3.1.0
        with:
          dockerfile: <%= spec.ui ? 'apps/web/Dockerfile' : 'Dockerfile' %>

      - uses: docker/setup-buildx-action@v3

      # Built but NOT pushed on a PR. This is the step that proves the image is buildable
      # before it reaches the deploy pipeline, where a failure is far more expensive.
<% if (spec.ui) { -%>
      - name: Build web image
        uses: docker/build-push-action@v6
        with:
          context: <%= spec.api ? 'apps/web' : '.' %>
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
<% } -%>
<% if (spec.api) { -%>
      - name: Build api image
        uses: docker/build-push-action@v6
        with:
          context: <%= spec.ui ? 'apps/api' : '.' %>
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
<% } -%>
<% } -%>

<% if (spec.ops.k8s.enabled) { -%>
  manifests:
    name: Kubernetes manifests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4

      - name: Lint chart
        run: helm lint deploy

      # Renders every environment. A values file that breaks the chart is otherwise only
      # discovered by ArgoCD, at deploy time, in that environment.
      - name: Render and validate manifests
        run: |
          curl -sSL https://github.com/yannh/kubeconform/releases/latest/download/kubeconform-linux-amd64.tar.gz \
            | tar xz -C /usr/local/bin kubeconform
          for env in dev staging prod; do
            echo "--- $env ---"
            helm template deploy \
              -f deploy/values.yaml \
              -f "deploy/values-$env.yaml" \
              --set image.tag=ci-validation \
              | kubeconform -strict -summary -schema-location default
          done
<% } -%>
