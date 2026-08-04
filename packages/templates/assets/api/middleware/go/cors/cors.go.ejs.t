---
to: internal/middleware/cors.go
---
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
)

// CORS answers cross-origin requests for the origins CORS_ORIGINS allows — never a wildcard.
//
// Hand-rolled rather than a dependency, deliberately: the whole policy is forty lines, the
// browser contract has not changed in a decade, and the wildcard-with-credentials mistake this
// guards against is rejected at boot by config.Load rather than here.
//
// Registered before auth on purpose. A preflight OPTIONS carries no credentials, so auth-first
// would 401 it — which the browser reports as an opaque CORS failure that names neither cause.
func CORS(cfg *config.Config) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, origin := range strings.Split(cfg.CORSOrigins, ",") {
		if trimmed := strings.TrimSpace(origin); trimmed != "" {
			allowed[trimmed] = true
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			// Same-origin or non-browser traffic; CORS has nothing to say.
			c.Next()
			return
		}

		if !allowed[origin] {
			// A disallowed preflight is terminated here; a disallowed simple request proceeds
			// without CORS headers, and the browser enforces the block. Both are the spec's
			// intended behaviour — the server's job is to not vouch for the origin.
			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			c.Next()
			return
		}

		h := c.Writer.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		// The response varies by Origin, and a shared cache that does not know that will serve
		// one origin's approval to another.
		h.Add("Vary", "Origin")
		h.Set("Access-Control-Allow-Credentials", "true")
		h.Set("Access-Control-Expose-Headers", "X-Request-Id")

		if c.Request.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id")
			// Cache the preflight for 10 minutes. Without it a browser sends an OPTIONS before
			// every single cross-origin request, doubling the request count for no benefit.
			h.Set("Access-Control-Max-Age", "600")
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
