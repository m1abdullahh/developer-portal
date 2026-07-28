---
to: deploy/templates/serviceaccount.yaml
---
{{- if .Values.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "app.serviceAccountName" . }}
  labels: {{- include "app.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations: {{- toYaml . | nindent 4 }}
  {{- end }}
# The default is true, which mounts a usable API token into every pod. This workload does not
# call the Kubernetes API, so the token is only an escalation path.
automountServiceAccountToken: false
{{- end }}
