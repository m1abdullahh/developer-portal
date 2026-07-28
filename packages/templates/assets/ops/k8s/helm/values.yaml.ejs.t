---
to: deploy/values.yaml
---
# Defaults for <%= spec.meta.projectName %>.
# Environment overrides live in values-dev.yaml / values-staging.yaml / values-prod.yaml.

nameOverride: ''
fullnameOverride: ''

image:
  repository: <%= spec.ops.cicd.registry === 'ghcr' ? 'ghcr.io/OWNER/' + spec.meta.slug : spec.meta.slug %>
  # Overwritten by CI with the commit SHA on every deploy. Never `latest`: a mutable tag makes
  # rollbacks guesswork and means two pods of the "same" version can run different code.
  tag: ''
  pullPolicy: IfNotPresent

replicaCount: <%= spec.ops.k8s.replicas %>

serviceAccount:
  create: true
  name: ''
  annotations: {}
<% if (spec.meta.deploymentTarget === 'aws-eks') { -%>
    # IRSA: set to the role ARN to grant AWS permissions without static credentials.
    # eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/<%= spec.meta.slug %>
<% } -%>

service:
  type: ClusterIP
  port: 80
  targetPort: <%= spec.ui && spec.api ? 3001 : spec.ui ? 3000 : 3001 %>

ingress:
  enabled: <%= spec.ops.k8s.ingress !== 'none' %>
  className: <%= spec.ops.k8s.ingress %>
  host: <%= spec.meta.slug %>.example.com
  tls:
    enabled: true
    secretName: <%= spec.meta.slug %>-tls
  annotations:
<% if (spec.ops.k8s.ingress === 'nginx') { -%>
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: 8m
<% } else if (spec.ops.k8s.ingress === 'traefik') { -%>
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
<% } -%>

resources:
  requests:
    cpu: <%= spec.ops.k8s.resources.requests.cpu %>
    memory: <%= spec.ops.k8s.resources.requests.memory %>
  limits:
    # No CPU limit on purpose: CPU is compressible, and a limit throttles the process at the
    # quota rather than letting it use idle capacity. Memory IS limited, because exceeding
    # memory is not throttled — it is an OOM kill.
    memory: <%= spec.ops.k8s.resources.limits.memory %>

autoscaling:
  enabled: <%= spec.ops.k8s.hpa.enabled %>
  minReplicas: <%= spec.ops.k8s.hpa.min %>
  maxReplicas: <%= spec.ops.k8s.hpa.max %>
  targetCPUUtilizationPercentage: <%= spec.ops.k8s.hpa.cpuTargetPercent %>

podDisruptionBudget:
  enabled: true
  minAvailable: 1

networkPolicy:
  enabled: true
  # Namespaces allowed to reach this service. Default-deny otherwise.
  allowFromNamespaces:
    - ingress-nginx

env: []
# Non-secret configuration, rendered into a ConfigMap.
#  - name: LOG_LEVEL
#    value: info

secretRefs: []
# Secrets are referenced, never templated. Values come from a real secret manager (External
# Secrets, Sealed Secrets, SSM) — putting them here would commit them to git.
#  - <%= spec.meta.slug %>-secrets

probes:
  liveness:
    path: /health
    initialDelaySeconds: 10
    periodSeconds: 15
  readiness:
    path: /ready
    initialDelaySeconds: 5
    periodSeconds: 10
