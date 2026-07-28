---
to: deploy/Chart.yaml
---
apiVersion: v2
name: <%= spec.meta.slug %>
description: <%= spec.meta.projectName %> — deployed to <%= spec.meta.deploymentTarget %>
type: application

# Chart version tracks the chart's own shape; appVersion tracks the software. They move
# independently — a values change is a chart bump, a code release is an appVersion bump.
version: 0.1.0
appVersion: '0.1.0'

annotations:
  idp.generated: 'true'
  idp.client: <%= h.json(spec.meta.clientName) %>
