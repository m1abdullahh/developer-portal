---
to: internal/graphql/schema.graphql
---
# GraphQL schema for <%= spec.meta.projectName %>.
#
# Schema-first: this file is the contract. It is embedded into the binary at compile time, bound
# to the resolver methods in resolver.go by name when the server starts, and served verbatim at
# GET /schema.graphql — the Service Catalog reads this API's shape from exactly that path.

"""Liveness, mirrored from GET /health so one query proves the whole stack end to end."""
type Health {
  status: String!
  service: String!
  """Seconds since the process started."""
  uptime: Float!
}

type Query {
  health: Health!
}

# Page modules and your own code extend the schema below this line, for example
#   extend type Query { widgets: [Widget!]! }
# Every field needs a matching resolver method; a mismatch fails at start-up with the field named.
# Anything outside the marker region is yours and is never rewritten.
# >>> idp:graphql-schema
# <<< idp:graphql-schema
