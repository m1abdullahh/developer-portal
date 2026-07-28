---
to: gitops/project.yaml
---
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: <%= spec.meta.slug %>
  namespace: argocd
spec:
  description: <%= spec.meta.projectName %> (<%= spec.meta.clientName %>)

  # Allowlist, not a wildcard. An AppProject with `sourceRepos: ["*"]` lets anyone who can
  # create an Application in it deploy arbitrary manifests from any repository — which turns
  # Application-create permission into cluster-admin.
  sourceRepos:
    - https://github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>.git

  destinations:
    - server: <%= spec.ops.gitops.targetCluster ?? 'https://kubernetes.default.svc' %>
      namespace: <%= spec.ops.k8s.namespace %>
    - server: <%= spec.ops.gitops.targetCluster ?? 'https://kubernetes.default.svc' %>
      namespace: <%= spec.ops.k8s.namespace %>-dev
    - server: <%= spec.ops.gitops.targetCluster ?? 'https://kubernetes.default.svc' %>
      namespace: <%= spec.ops.k8s.namespace %>-staging

  # Namespaced resources only. Without this restriction the project could create
  # ClusterRoleBindings and grant itself anything.
  clusterResourceWhitelist: []

  namespaceResourceWhitelist:
    - group: ''
      kind: Service
    - group: ''
      kind: ConfigMap
    - group: ''
      kind: ServiceAccount
    - group: apps
      kind: Deployment
    - group: autoscaling
      kind: HorizontalPodAutoscaler
    - group: networking.k8s.io
      kind: Ingress
    - group: networking.k8s.io
      kind: NetworkPolicy
    - group: policy
      kind: PodDisruptionBudget

  # Secrets are managed outside Argo (External Secrets, Sealed Secrets, SSM), so the project
  # is denied the ability to create them at all.
  namespaceResourceBlacklist:
    - group: ''
      kind: Secret

  orphanedResources:
    # Warn rather than delete: something running in the namespace that Argo did not create is
    # worth a human looking at, not an automatic removal.
    warn: true
