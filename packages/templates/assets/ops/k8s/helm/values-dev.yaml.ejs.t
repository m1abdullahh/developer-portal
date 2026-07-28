---
to: deploy/values-dev.yaml
---
# Development overrides.
replicaCount: 1

ingress:
  host: <%= spec.meta.slug %>-dev.example.com
  tls:
    secretName: <%= spec.meta.slug %>-dev-tls

# Off in dev: one pod keeps logs and `kubectl exec` predictable, and autoscaling on near-zero
# traffic only adds noise.
autoscaling:
  enabled: false

# Disabled deliberately. A PDB of minAvailable 1 against a single replica blocks node drains
# entirely, so cluster maintenance hangs waiting for a pod that can never be evicted.
podDisruptionBudget:
  enabled: false

resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    memory: 256Mi

env:
  - name: LOG_LEVEL
    value: debug
  - name: NODE_ENV
    value: production
