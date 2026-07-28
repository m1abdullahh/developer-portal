---
to: deploy/templates/networkpolicy.yaml
---
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "app.fullname" . }}
  labels: {{- include "app.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels: {{- include "app.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Default-deny: without a NetworkPolicy every pod in the cluster can reach this service
    # directly, bypassing the ingress controller and whatever it enforces.
    {{- range .Values.networkPolicy.allowFromNamespaces }}
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ . }}
      ports:
        - protocol: TCP
          port: {{ $.Values.service.targetPort }}
    {{- end }}
  egress:
    # DNS must be allowed explicitly. A default-deny egress policy without this makes every
    # hostname lookup fail, which surfaces as connection timeouts rather than a DNS error.
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    # Outbound HTTPS for external APIs and the database.
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32 # cloud metadata endpoint — a well-known SSRF target
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 5432
{{- end }}
