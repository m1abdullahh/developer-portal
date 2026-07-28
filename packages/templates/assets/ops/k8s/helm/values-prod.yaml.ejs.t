---
to: deploy/values-prod.yaml
---
# Production overrides.
replicaCount: <%= Math.max(spec.ops.k8s.replicas, 2) %>

ingress:
  host: <%= spec.meta.slug %>.example.com
  tls:
    secretName: <%= spec.meta.slug %>-tls

autoscaling:
  enabled: <%= spec.ops.k8s.hpa.enabled %>
  minReplicas: <%= Math.max(spec.ops.k8s.hpa.min, 2) %>
  maxReplicas: <%= spec.ops.k8s.hpa.max %>
  targetCPUUtilizationPercentage: <%= spec.ops.k8s.hpa.cpuTargetPercent %>

# minAvailable 2, not 1: guaranteeing a single pod still allows a drain to leave the service
# with no headroom for a concurrent failure.
podDisruptionBudget:
  enabled: true
  minAvailable: 2

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

# Real values come from a secret manager. Nothing sensitive is ever templated into this repo.
secretRefs:
  - <%= spec.meta.slug %>-secrets
