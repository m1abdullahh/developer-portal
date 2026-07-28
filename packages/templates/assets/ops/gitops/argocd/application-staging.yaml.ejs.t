---
to: gitops/application-staging.yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <%= spec.meta.slug %>-staging
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
        - values-staging.yaml
  destination:
    server: <%= spec.ops.gitops.targetCluster ?? 'https://kubernetes.default.svc' %>
    namespace: <%= spec.ops.k8s.namespace %>-staging
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
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
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
