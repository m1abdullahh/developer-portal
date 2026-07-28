---
to: gitops/application-dev.yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <%= spec.meta.slug %>-dev
  namespace: argocd
  finalizers:
    # Without this, deleting the Application orphans every resource it created — they keep
    # running, keep costing money, and no longer appear in any Argo view.
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
        - values-dev.yaml
  destination:
    server: <%= spec.ops.gitops.targetCluster ?? 'https://kubernetes.default.svc' %>
    namespace: <%= spec.ops.k8s.namespace %>-dev
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
    # The HPA owns replicas. Without this Argo sees the autoscaled count as drift, resets it to
    # the chart value, the HPA scales it back, and the two fight forever — showing as an
    # Application that is permanently OutOfSync for no visible reason.
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
