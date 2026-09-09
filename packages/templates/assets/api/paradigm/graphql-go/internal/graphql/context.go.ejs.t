---
to: internal/graphql/context.go
---
package graphql

import (
	"context"
<% if (spec.api.middleware.auth === 'jwt') { -%>
	"errors"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/middleware"
<% } -%>
)

// Loaders — the N+1 guard.
//
// A list field resolves once per row, so a resolver that queries the database directly turns a
// page of 50 rows into 51 queries. A batched loader (github.com/graph-gophers/dataloader) collects
// every Load(key) made while an operation executes, issues one query, and hands each caller its
// row. Instances live here and are created per request in Install, so the cache never outlives
// the operation that filled it.
//
// Page modules contribute theirs through the marker regions.
type Loaders struct {
	// >>> idp:graphql-loaders
	// <<< idp:graphql-loaders
}

func newLoaders() *Loaders {
	return &Loaders{
		// >>> idp:graphql-loader-instances
		// <<< idp:graphql-loader-instances
	}
}

type contextKey int

const (
	loadersKey contextKey = iota
<% if (spec.api.middleware.auth === 'jwt') { -%>
	userKey
<% } -%>
)

func withLoaders(ctx context.Context, loaders *Loaders) context.Context {
	return context.WithValue(ctx, loadersKey, loaders)
}

// LoadersFrom returns the request's loaders. Nil outside a request, which no resolver is.
func LoadersFrom(ctx context.Context) *Loaders {
	loaders, _ := ctx.Value(loadersKey).(*Loaders)
	return loaders
}
<% if (spec.api.middleware.auth === 'jwt') { -%>

func withUser(ctx context.Context, user middleware.AuthenticatedUser) context.Context {
	return context.WithValue(ctx, userKey, user)
}

// ErrUnauthenticated is what a resolver returns for an anonymous caller. graph-gophers reports it
// in the GraphQL errors array, which is the transport's convention rather than a mistake.
var ErrUnauthenticated = errors.New("a valid access token is required")

// RequireUser returns the caller or ErrUnauthenticated. Call it at the top of any resolver that
// needs a signed-in user:
//
//	user, err := RequireUser(ctx)
//	if err != nil {
//		return nil, err
//	}
func RequireUser(ctx context.Context) (middleware.AuthenticatedUser, error) {
	user, ok := ctx.Value(userKey).(middleware.AuthenticatedUser)
	if !ok {
		return middleware.AuthenticatedUser{}, ErrUnauthenticated
	}
	return user, nil
}
<% } -%>
