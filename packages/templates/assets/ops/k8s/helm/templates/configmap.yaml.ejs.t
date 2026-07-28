---
to: deploy/templates/configmap.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "app.fullname" . }}-config
  labels: {{- include "app.labels" . | nindent 4 }}
data:
  {{- range .Values.env }}
  {{ .name }}: {{ .value | quote }}
  {{- end }}
