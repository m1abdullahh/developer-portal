---
to: deploy/templates/_helpers.tpl
---
{{/*
Name helpers. Truncated to 63 characters because that is the Kubernetes label value limit —
exceeding it fails the apply with a validation error rather than truncating silently.
*/}}
{{- define "app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "app.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "app.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "app.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Standard Kubernetes recommended labels. */}}
{{- define "app.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "app.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ .Values.partOf | default "<%= h.kebab(spec.meta.clientName) %>" }}
{{- end -}}

{{/*
Selector labels are immutable on a Deployment: changing them requires deleting and recreating
it. They deliberately exclude version and chart labels, which change on every release.
*/}}
{{- define "app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Fails the render rather than deploying a mutable or missing tag. */}}
{{- define "app.imageTag" -}}
{{- required "image.tag must be set — CI writes the commit SHA. Never deploy `latest`." .Values.image.tag -}}
{{- end -}}
