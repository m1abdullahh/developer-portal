# Security and reliability policy for every manifest this generator emits.
#
# kubeconform answers "is this valid Kubernetes?". This answers "is this Kubernetes we are willing
# to ship?" — a chart can be perfectly schema-valid and still run as root with no resource limits.
#
# Every rule here encodes a decision already made in the Helm templates. That is the point: the
# templates are the implementation and this is the regression guard, so a well-meaning edit that
# drops `runAsNonRoot` to debug something fails CI instead of reaching a cluster. A rule that the
# current chart does not already satisfy does not belong here — it would be an aspiration, and
# aspirations that fail CI get commented out within a week.
#
# Run by scripts/ops-lint.mjs against the rendered output of every environment, because dev and
# prod render different objects.

package main

# Accepted as a no-op on OPA 1.x and required on 0.x — keeps the file valid on both, so a conftest
# upgrade is not a silent syntax break.
import rego.v1

# ── shape helpers ────────────────────────────────────────────────────────────

# The kinds that carry a pod template. Only Deployment is generated today; the rest are listed so
# that adding a StatefulSet later inherits every rule below rather than quietly escaping them.
workload_kinds := {"Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"}

is_workload if workload_kinds[input.kind]

pod := input.spec.template.spec

name := sprintf("%s/%s", [input.kind, input.metadata.name])

containers contains c if {
	is_workload
	some c in pod.containers
}

containers contains c if {
	is_workload
	some c in pod.initContainers
}

# ── images ───────────────────────────────────────────────────────────────────

# Splits off any registry host before looking for a tag, so `registry.local:5000/app` is not
# mistaken for a tagged image because of the port.
image_ref(image) := ref if {
	parts := split(image, "/")
	ref := parts[count(parts) - 1]
}

deny contains msg if {
	some c in containers
	endswith(image_ref(c.image), ":latest")
	msg := sprintf("%s: container %q uses the `latest` tag — a rollback would be untraceable", [name, c.name])
}

deny contains msg if {
	some c in containers
	not contains(image_ref(c.image), ":")
	not contains(c.image, "@sha256:")
	msg := sprintf("%s: container %q image %q has no tag", [name, c.name, c.image])
}

# ── resources ────────────────────────────────────────────────────────────────

# Requests drive scheduling; without them the scheduler treats the pod as free and overcommits
# the node until something is evicted.
deny contains msg if {
	some c in containers
	some field in ["cpu", "memory"]
	not c.resources.requests[field]
	msg := sprintf("%s: container %q sets no %s request", [name, c.name, field])
}

# Memory only, deliberately. Memory is incompressible — exceeding it is an OOM kill, so it must be
# bounded. CPU is compressible, and a CPU limit throttles the process at its quota even when the
# node is idle. The chart's values.yaml makes the same argument in the same words; this rule exists
# to stop someone "fixing" the missing CPU limit without reading it.
deny contains msg if {
	some c in containers
	not c.resources.limits.memory
	msg := sprintf("%s: container %q sets no memory limit", [name, c.name])
}

# ── pod security ─────────────────────────────────────────────────────────────

deny contains msg if {
	is_workload
	not pod.securityContext.runAsNonRoot == true
	msg := sprintf("%s: pod does not set runAsNonRoot", [name])
}

deny contains msg if {
	is_workload
	pod.securityContext.runAsUser == 0
	msg := sprintf("%s: pod runs as UID 0", [name])
}

# Without this the pod keeps the node's default seccomp profile, which on most clusters is
# `Unconfined` — every syscall available.
deny contains msg if {
	is_workload
	not pod.securityContext.seccompProfile.type in {"RuntimeDefault", "Localhost"}
	msg := sprintf("%s: pod does not set a seccomp profile", [name])
}

deny contains msg if {
	is_workload
	some field in ["hostNetwork", "hostPID", "hostIPC"]
	pod[field] == true
	msg := sprintf("%s: pod sets %s — it shares the node's namespace", [name, field])
}

# ── container security ───────────────────────────────────────────────────────

deny contains msg if {
	some c in containers
	c.securityContext.privileged == true
	msg := sprintf("%s: container %q is privileged", [name, c.name])
}

deny contains msg if {
	some c in containers
	not c.securityContext.allowPrivilegeEscalation == false
	msg := sprintf("%s: container %q does not disable privilege escalation", [name, c.name])
}

deny contains msg if {
	some c in containers
	not c.securityContext.readOnlyRootFilesystem == true
	msg := sprintf("%s: container %q has a writable root filesystem", [name, c.name])
}

# Dropping ALL and adding back nothing is the whole posture. A container that drops a named list
# instead keeps every capability the list forgot.
deny contains msg if {
	some c in containers
	not "ALL" in c.securityContext.capabilities.drop
	msg := sprintf("%s: container %q does not drop ALL capabilities", [name, c.name])
}

deny contains msg if {
	some c in containers
	count(object.get(c, ["securityContext", "capabilities", "add"], [])) > 0
	msg := sprintf("%s: container %q adds capabilities back", [name, c.name])
}

# ── availability ─────────────────────────────────────────────────────────────

# Long-running workloads only. A Job has no steady state to probe, and demanding probes there
# would push people to write meaningless ones.
long_running if input.kind in {"Deployment", "StatefulSet", "DaemonSet"}

deny contains msg if {
	long_running
	some c in pod.containers
	some probe in ["livenessProbe", "readinessProbe"]
	not c[probe]
	msg := sprintf("%s: container %q has no %s", [name, c.name, probe])
}

# Deliberately NOT a rule: "liveness and readiness must probe different paths".
#
# It is good advice for a service with dependencies — sharing a path means a database outage that
# fails readiness also restarts the pod, turning degradation into a crash loop. But a static file
# server has no dependency to be un-ready for, and neither does a Next server, so two of our three
# images share a path correctly. A rule that fires on correct output teaches people to ignore the
# tool. The distinction lives in the deployable contract, where it can be reasoned about per image.

# `latest`-style rollouts with a single replica have no capacity headroom during a deploy.
warn contains msg if {
	input.kind == "Deployment"
	not input.spec.replicas
	not input.spec.strategy.rollingUpdate.maxSurge
	msg := sprintf("%s: autoscaled deployment sets no maxSurge", [name])
}

# ── service accounts ─────────────────────────────────────────────────────────

# The API token is mounted by default, and a workload that does not call the API gains nothing
# from it but an escalation path.
deny contains msg if {
	input.kind == "ServiceAccount"
	not input.automountServiceAccountToken == false
	msg := sprintf("%s: mounts an API token by default", [name])
}
