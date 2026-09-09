---
to: schema.graphql
---
# GraphQL schema for <%= spec.meta.projectName %>.
#
# Schema-first: this file is the contract. `npm run codegen` derives the TypeScript resolver types
# from it (src/graphql/generated/), the server loads it at start-up, and GET /schema.graphql serves
# it verbatim — the Service Catalog reads this API's shape from exactly that path.

"""Liveness, mirrored from GET /health so one query proves the whole stack end to end."""
type Health {
  status: String!
  service: String!
  """Seconds since the process started."""
  uptime: Float!
}
<% if (spec.api.orm === 'prisma') { -%>

"""The example model from prisma/schema.prisma. Replace it with your domain."""
type Example {
  id: ID!
  name: String!
  """ISO-8601 timestamp."""
  createdAt: String!
  """ISO-8601 timestamp."""
  updatedAt: String!
}
<% } -%>

type Query {
  health: Health!
<% if (spec.api.orm === 'prisma') { -%>
  """Batched through a DataLoader: N of these in one operation cost one database query."""
  example(id: ID!): Example
  examples(limit: Int = 20): [Example!]!
<% } -%>
}

# Page modules and your own code extend the schema below this line, for example
#   extend type Query { widgets: [Widget!]! }
# Anything outside the marker region is yours and is never rewritten.
# >>> idp:graphql-schema
# <<< idp:graphql-schema
