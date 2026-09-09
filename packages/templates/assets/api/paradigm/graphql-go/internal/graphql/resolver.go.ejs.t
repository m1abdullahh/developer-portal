---
to: internal/graphql/resolver.go
---
package graphql

import (
	"context"
	"time"
)

var startedAt = time.Now()

// Resolver is the root of the schema: one method per Query field, matched by name. The structs
// those methods return resolve their own fields (UseFieldResolvers), so a plain struct with
// exported fields is a GraphQL object with no further code.
type Resolver struct{}

// Health mirrors GET /health so one query proves the whole stack.
type Health struct {
	Status  string
	Service string
	Uptime  float64
}

func (r *Resolver) Health(ctx context.Context) *Health {
	return &Health{
		Status:  "ok",
		Service: "<%= spec.meta.slug %>",
		Uptime:  time.Since(startedAt).Seconds(),
	}
}

// Page modules and your own code add resolver methods below. Look entities up through
// LoadersFrom(ctx), never directly — see context.go for why.
// >>> idp:graphql-resolvers
// <<< idp:graphql-resolvers
