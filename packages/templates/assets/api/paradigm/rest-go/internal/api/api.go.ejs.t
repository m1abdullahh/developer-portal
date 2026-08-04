---
to: internal/api/api.go
---
// Package api mounts the schema-driven REST layer.
//
// Gin alone validates nothing and documents nothing, and the mainstream Go answer — swag
// annotations in comments — is a hand-maintained document wearing a generated one's clothes:
// nothing checks the annotation against the handler it describes. huma derives request
// validation and the OpenAPI 3.1 document from the same Go structs, which is the property the
// other two runtimes are built around (Zod on Node, Pydantic on Python). One definition, no
// drift, because there is nothing to keep in sync.
package api

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/gin-gonic/gin"
)

// Install mounts the API layer onto the gin engine and returns the handle routes register on:
//
//	huma.Register(apiHandle, huma.Operation{
//		OperationID: "list-widgets",
//		Method:      http.MethodGet,
//		Path:        "/widgets",
//		Summary:     "List widgets",
//	}, listWidgets)
//
// Handlers take a typed input struct and return a typed output struct; validation, the 422
// response and the document all fall out of the types.
func Install(r *gin.Engine) huma.API {
	config := huma.DefaultConfig("<%= spec.meta.slug %>", "0.1.0")

	// `/docs` and `/openapi.json` are CONTRACTUAL: the Service Catalog fetches the document from
	// exactly that path, so moving it removes this service's API documentation from the portal.
	config.DocsPath = "/docs"
	config.OpenAPIPath = "/openapi"

	config.Info.Description = "<%= (spec.meta.description || spec.meta.slug).replace(/"/g, '\\"') %>"
<% if (spec.api.middleware.auth === 'jwt') { -%>

	// The bearer scheme, so /docs can send an Authorization header and a generated client knows
	// how to authenticate. The framework has no way to infer this.
	config.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"bearerAuth": {Type: "http", Scheme: "bearer", BearerFormat: "JWT"},
	}
<% } -%>

	return humagin.New(r, config)
}
