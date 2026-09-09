---
to: internal/graphql/graphql.go
---
// Package graphql mounts the GraphQL layer.
//
// graph-gophers/graphql-go rather than gqlgen, and the reason is the one that gated sqlc: gqlgen
// is a code generator, and the portal renders projects in memory with no Go toolchain to run one.
// graph-gophers is schema-first without generation — the SDL is parsed at start-up and bound to
// resolver methods by name, so a resolver that disagrees with the schema fails at boot with the
// field named. The test in this package turns that into a check every `go test` run performs.
package graphql

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
	graphqlgo "github.com/graph-gophers/graphql-go"
	"github.com/graph-gophers/graphql-go/relay"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
<% if (spec.api.middleware.auth === 'jwt') { -%>
	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/middleware"
<% } -%>
)

// The schema is a file so the text the catalog reads, the text the server executes and the text
// you edit are one text. Embedded at compile time, so the binary carries it.
//
//go:embed schema.graphql
var schemaSDL string

// Install mounts POST /graphql and GET /schema.graphql — and GraphiQL on GET /graphql outside
// production — onto the gin engine, behind every middleware registered before the routes.
//
// /schema.graphql is a CONTRACT: the Service Catalog reads this API's shape from exactly that
// path (doc 07 §4). Changing it removes the schema from the catalog.
func Install(r *gin.Engine, cfg *config.Config) {
	opts := []graphqlgo.SchemaOpt{graphqlgo.UseFieldResolvers()}
	if cfg.Environment == "production" {
		// Introspection is a development tool; the schema stays available as text below.
		opts = append(opts, graphqlgo.DisableIntrospection())
	}
	schema := graphqlgo.MustParseSchema(schemaSDL, &Resolver{}, opts...)
	handler := &relay.Handler{Schema: schema}

	r.POST("/graphql", func(c *gin.Context) {
		ctx := withLoaders(c.Request.Context(), newLoaders())
<% if (spec.api.middleware.auth === 'jwt') { -%>
		// Verified here, not by a route guard: one endpoint serves public and protected operations
		// alike, so authentication is optional at the transport and enforced per resolver with
		// RequireUser. A missing or invalid token yields an anonymous context, never a 401 for the
		// whole request — the schema decides which fields need a caller.
		if user, ok := middleware.OptionalUser(c, cfg); ok {
			ctx = withUser(ctx, user)
		}
<% } -%>
		handler.ServeHTTP(c.Writer, c.Request.WithContext(ctx))
	})

	r.GET("/schema.graphql", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(schemaSDL))
	})

	if cfg.Environment != "production" {
		r.GET("/graphql", func(c *gin.Context) {
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(graphiqlPage))
		})
	}
}

// GraphiQL from a CDN, in development only. Nothing is vendored: the page is a few lines that
// load the IDE and point it at /graphql, and it is never served in production.
const graphiqlPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title><%= spec.meta.projectName %> — GraphiQL</title>
    <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
  </head>
  <body style="margin: 0">
    <div id="graphiql" style="height: 100vh"></div>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
    <script>
      ReactDOM.createRoot(document.getElementById('graphiql')).render(
        React.createElement(GraphiQL, { fetcher: GraphiQL.createFetcher({ url: '/graphql' }) }),
      );
    </script>
  </body>
</html>
`
