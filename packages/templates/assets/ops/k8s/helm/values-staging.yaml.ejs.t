---
to: deploy/values-staging.yaml
---
# Staging overrides — deliberately production-shaped, so problems surface here first.
replicaCount: 2

ingress:
  host: <%= spec.meta.slug %>-staging.example.com
  tls:
    secretName: <%= spec.meta.slug %>-staging-tls

autoscaling:
  enabled: <%= spec.ops.k8s.hpa.enabled %>
  minReplicas: 2
  maxReplicas: <%= Math.max(Math.floor(spec.ops.k8s.hpa.max / 2), 2) %>
  targetCPUUtilizationPercentage: <%= spec.ops.k8s.hpa.cpuTargetPercent %>

podDisruptionBudget:
  enabled: true
  minAvailable: 1

resources:
  requests:
    cpu: <%= spec.ops.k8s.resources.requests.cpu %>
    memory: <%= spec.ops.k8s.resources.requests.memory %>
  limits:
    memory: <%= spec.ops.k8s.resources.limits.memory %>

env:
  - name: LOG_LEVEL
    value: info
  - name: NODE_ENV
    value: production

secretRefs:
  - <%= spec.meta.slug %>-secrets
