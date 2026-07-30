---
to: deploy/templates/deployment.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "app.fullname" . }}
  labels: {{- include "app.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      # maxUnavailable 0 means capacity never dips during a deploy: a new pod must become
      # Ready before an old one is removed.
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels: {{- include "app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels: {{- include "app.labels" . | nindent 8 }}
      annotations:
        # Rolls pods when config changes. Without this, a ConfigMap edit updates the object
        # but running pods keep the old values until something unrelated restarts them.
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      serviceAccountName: {{ include "app.serviceAccountName" . }}
      securityContext:
        runAsNonRoot: true
        # The UID baked into this project's image. Distroless is 65532; the unprivileged nginx
        # image is 101. A mismatch here is not a permission error at startup — the process runs
        # as an ID that owns none of its own working directories, and fails on first write.
        runAsUser: <%= deployable.runAsUser %>
        runAsGroup: <%= deployable.runAsUser %>
        fsGroup: <%= deployable.runAsUser %>
        seccompProfile:
          type: RuntimeDefault
      terminationGracePeriodSeconds: 30
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ include "app.imageTag" . }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          envFrom:
            - configMapRef:
                name: {{ include "app.fullname" . }}-config
            {{- range .Values.secretRefs }}
            - secretRef:
                name: {{ . }}
            {{- end }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: http
            initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: {{ .Values.probes.readiness.path }}
              port: http
            initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
            failureThreshold: 3
          # Startup probe covers slow first boots (migrations, JIT warmup) without forcing a
          # long initialDelaySeconds on liveness, which would delay crash detection forever after.
          startupProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: http
            periodSeconds: 5
            failureThreshold: 30
          resources: {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            # readOnlyRootFilesystem is on, so anything needing writes gets an explicit emptyDir.
            # The list comes from the image: /tmp covers most of them, and nginx additionally
            # buffers request bodies and proxy responses under /var/cache/nginx.
<% for (const p of deployable.writablePaths) { -%>
            - name: <%= h.kebab(p) %>
              mountPath: <%= p %>
<% } -%>
      volumes:
<% for (const p of deployable.writablePaths) { -%>
        - name: <%= h.kebab(p) %>
          emptyDir: {}
<% } -%>
      # Spread replicas across zones so a single zone failure cannot take every pod.
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: {{- include "app.selectorLabels" . | nindent 14 }}
