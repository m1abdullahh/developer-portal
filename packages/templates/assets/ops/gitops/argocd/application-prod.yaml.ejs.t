---
to: gitops/application-prod.yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <%= spec.meta.slug %>-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  labels:
    idp.generated: "true"
    idp.client: <%= h.kebab(spec.meta.clientName) %>
spec:
  project: <%= spec.meta.slug %>
  source:
    repoURL: https://github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>.git
    targetRevision: <%= spec.meta.repo.defaultBranch %>
    path: deploy
    helm:
      valueFiles:
        - values.yaml
        - values-prod.yaml
  destination:
    server: <%= spec.ops.gitops.targetCluster ?? 'https://kubernetes.default.svc' %>
    namespace: <%= spec.ops.k8s.namespace %>
  syncPolicy:
<% if (spec.ops.gitops.syncPolicy === 'auto-prune') { -%>
    # Auto-prune was explicitly requested for production. Note what this means: a resource
    # removed from the chart is deleted from the cluster on the next sync, with no
    # confirmation step.
    automated:
      prune: true
      selfHeal: true
<% } else { -%>
    # MANUAL for production, deliberately — even when other environments sync automatically.
    #
    # Automated sync means a merge to the default branch deploys to production immediately,
    # with no human between a bad commit and live traffic. Promote with:
    #   argocd app sync <%= spec.meta.slug %>-prod
    #
    # Change this only with a deployment process that makes it safe.
<% } -%>
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  ignoreDifferences:
    # The HPA owns replicas — see application-dev.yaml.
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
  revisionHistoryLimit: 10
