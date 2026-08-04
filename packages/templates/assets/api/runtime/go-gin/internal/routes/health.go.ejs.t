---
to: internal/routes/health.go
---
package routes

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	// >>> idp:imports
	// <<< idp:imports
)

var startedAt = time.Now()

// RegisterHealth mounts liveness and readiness.
//
// These two paths are CONTRACTUAL: the generated Kubernetes deployment points its probes at them
// (doc 04 §2), and the deployable contract records them so the chart and the image cannot drift.
// Renaming either without updating both causes restart loops that look like an application crash.
func RegisterHealth(r *gin.Engine) {
	// Liveness deliberately checks nothing downstream. Querying the database from a liveness
	// probe means one brief database blip restarts every pod at once, turning a recoverable
	// outage into a total one.
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "<%= spec.meta.slug %>",
			"uptime":  time.Since(startedAt).Seconds(),
		})
	})

	// Readiness — can this pod serve traffic right now? Failing it removes the pod from the
	// Service without killing it, which is the correct response to a dependency being briefly
	// unavailable.
	r.GET("/ready", func(c *gin.Context) {
		checks := map[string]string{}

		// >>> idp:readiness-checks
		// <<< idp:readiness-checks

		status := http.StatusOK
		state := "ready"
		for _, value := range checks {
			if value == "error" {
				status = http.StatusServiceUnavailable
				state = "unavailable"
			}
		}

		c.JSON(status, gin.H{"status": state, "checks": checks})
	})
}
