---
to: internal/middleware/request_context.go
---
package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestContext logs one structured line per request and threads a request id through.
//
// The id is propagated from the inbound X-Request-Id when present, so one id follows a request
// across services rather than each hop inventing its own — and echoed back in the response so a
// client, or an operator reading a browser network tab, can quote it when reporting a failure.
//
// crypto/rand rather than a uuid dependency: sixteen random bytes rendered as hex carry the same
// entropy, and a dependency that duplicates the standard library is supply chain surface with no
// feature attached.
func RequestContext() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-Id")
		if requestID == "" {
			var buf [16]byte
			if _, err := rand.Read(buf[:]); err == nil {
				requestID = hex.EncodeToString(buf[:])
			}
		}

		c.Set("request_id", requestID)
		c.Writer.Header().Set("X-Request-Id", requestID)

		start := time.Now()
		c.Next()

		// No header dump, which is what makes redaction unnecessary here: the fields below are
		// enumerated, and none of them can carry a credential. Logging the request wholesale is
		// how bearer tokens end up retained and indexed in log storage.
		slog.Info("request completed",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", float64(time.Since(start).Microseconds())/1000.0,
			"client_ip", c.ClientIP(),
			"request_id", requestID,
		)
	}
}
