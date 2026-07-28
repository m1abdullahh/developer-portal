---
to: deploy/templates/pdb.yaml
---
{{- if .Values.podDisruptionBudget.enabled }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "app.fullname" . }}
  labels: {{- include "app.labels" . | nindent 4 }}
spec:
  # Without a PDB, draining a node for maintenance can evict every replica at once. This is
  # the difference between a rolling node upgrade and an outage.
  minAvailable: {{ .Values.podDisruptionBudget.minAvailable }}
  selector:
    matchLabels: {{- include "app.selectorLabels" . | nindent 6 }}
{{- end }}
