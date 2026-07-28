---
to: .github/workflows/cd.yml
skip_if: <%= !spec.ops.cicd.buildPush %>
---
name: CD

on:
  push:
    branches: [<%= spec.meta.repo.defaultBranch %>]

concurrency:
  # NOT cancel-in-progress: cancelling a half-finished deploy can leave the chart tag updated
  # with no matching image pushed.
  group: cd-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
<% if (spec.ops.cicd.registry === 'ecr') { -%>
  id-token: write # OIDC federation to AWS — no long-lived keys in repo secrets
<% } else if (spec.ops.cicd.registry === 'ghcr') { -%>
  packages: write
<% } -%>

jobs:
  build-and-push:
    name: Build and push
    runs-on: ubuntu-latest
    timeout-minutes: 25
    outputs:
      sha: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Compute image tag
        id: meta
        # The commit SHA, never `latest`. An immutable tag is what makes a rollback a
        # deterministic operation rather than a guess about what `latest` pointed at.
        run: echo "sha=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"

<% if (spec.ops.cicd.registry === 'ecr') { -%>
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          # OIDC role assumption. Static AWS keys in repo secrets are the single most common
          # leak vector in this pipeline shape.
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2
        id: registry
<% } else if (spec.ops.cicd.registry === 'ghcr') { -%>
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
<% } else { -%>
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
<% } -%>

      - uses: docker/setup-buildx-action@v3

<% if (spec.ui) { -%>
      - name: Build and push web
        uses: docker/build-push-action@v6
        with:
          context: <%= spec.api ? 'apps/web' : '.' %>
          push: true
          tags: ${{ vars.IMAGE_REPO_WEB }}:${{ steps.meta.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true
<% } -%>
<% if (spec.api) { -%>
      - name: Build and push api
        uses: docker/build-push-action@v6
        with:
          context: <%= spec.ui ? 'apps/api' : '.' %>
          push: true
          tags: ${{ vars.IMAGE_REPO_API }}:${{ steps.meta.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true
<% } -%>

<% if (spec.ops.k8s.enabled && spec.ops.gitops.enabled) { -%>
  gitops:
    name: Update GitOps tag
    needs: build-and-push
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      # ── The GitOps hand-off ──────────────────────────────────────────────
      # This job updates the chart's image tag and commits. It deliberately does NOT run
      # `kubectl apply` or `argocd app sync`: the repository is the source of truth, and
      # ArgoCD reconciles from it. A pipeline that applies directly makes the cluster diverge
      # from git, which is precisely the drift GitOps exists to eliminate.
      - name: Pin image tag in dev values
        run: |
          sed -i "s|^\( *tag:\).*|\1 ${{ needs.build-and-push.outputs.sha }}|" deploy/values-dev.yaml
          grep -n "tag:" deploy/values-dev.yaml

      - name: Commit
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add deploy/values-dev.yaml
          # No-op when the tag is unchanged (e.g. a docs-only commit), which would otherwise
          # fail the job on an empty commit.
          git diff --staged --quiet || git commit -m "chore(deploy): dev image ${{ needs.build-and-push.outputs.sha }} [skip ci]"
          git push

      - name: Deployment summary
        run: |
          {
            echo "### Deployed to dev"
            echo ""
            echo "| | |"
            echo "| --- | --- |"
            echo "| Image tag | \`${{ needs.build-and-push.outputs.sha }}\` |"
            echo "| Sync | ArgoCD reconciles automatically |"
            echo ""
            echo "Promote to production with \`argocd app sync <%= spec.meta.slug %>-prod\`."
          } >> "$GITHUB_STEP_SUMMARY"
<% } -%>
