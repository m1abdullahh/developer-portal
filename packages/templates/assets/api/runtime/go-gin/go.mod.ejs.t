---
to: go.mod
---
module github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>

go 1.25

// Direct dependencies only, exactly pinned. `go mod tidy` — your first act after cloning — adds
// the indirect block and go.sum; commit both, they are what makes two builds resolve identically.
require (
<% deps.forEach(function (dep) { -%>
	<%= dep %>
<% }); -%>
	// >>> idp:dependencies
	// <<< idp:dependencies
)
