---
to: internal/middleware/rate_limit.go
---
package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
)

// Probes are exempt. Throttling /health means Kubernetes eventually fails the liveness check and
// restarts a pod that was only ever guilty of being probed on schedule — a self-inflicted outage
// that looks exactly like an application crash.
var exemptPaths = map[string]bool{
	"/health": true,
	"/ready":  true,
}

// RateLimit applies fixed-window counters, per process.
//
// **The limit is per instance, not global.** With the HPA enabled a limit of 100 becomes
// 100 × replica-count and changes silently whenever the cluster scales. Enable the Redis cache
// layer in the wizard for a shared counter.
//
// Fixed window rather than sliding: it matches the Node and Python runtimes so the three behave
// identically at a boundary, and clearing the whole map at the rollover is also what bounds
// memory — a map keyed by client address with per-key expiry is a denial-of-service vector
// rather than a rate limiter.
func RateLimit(cfg *config.Config) gin.HandlerFunc {
	window := parseWindow(cfg.RateLimitWindow)
	limit := cfg.RateLimitMax

	var mu sync.Mutex
	hits := map[string]int{}
	windowStart := time.Now()

	return func(c *gin.Context) {
		if exemptPaths[c.Request.URL.Path] {
			c.Next()
			return
		}

		mu.Lock()
		if time.Since(windowStart) >= window {
			hits = map[string]int{}
			windowStart = time.Now()
		}

		key := c.ClientIP()
		hits[key]++
		count := hits[key]
		resetIn := int((window - time.Since(windowStart)).Seconds())
		mu.Unlock()

		remaining := limit - count
		if remaining < 0 {
			remaining = 0
		}
		if resetIn < 0 {
			resetIn = 0
		}

		h := c.Writer.Header()
		h.Set("X-RateLimit-Limit", strconv.Itoa(limit))
		h.Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		h.Set("X-RateLimit-Reset", strconv.Itoa(resetIn))

		if count > limit {
			c.Header("Retry-After", strconv.Itoa(resetIn))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":      "Too Many Requests",
				"message":    "Rate limit of " + strconv.Itoa(limit) + " requests exceeded.",
				"statusCode": http.StatusTooManyRequests,
			})
			return
		}

		c.Next()
	}
}

// parseWindow accepts the same vocabulary as the other two runtimes — "1 minute", "30 seconds",
// "1 hour" — because RATE_LIMIT_WINDOW is set by the Helm chart, and a team running one service
// in each language should not have to remember two formats.
func parseWindow(value string) time.Duration {
	parts := strings.Fields(strings.TrimSpace(value))

	amount := 1
	if len(parts) > 0 {
		if parsed, err := strconv.Atoi(parts[0]); err == nil && parsed > 0 {
			amount = parsed
		}
	}

	unit := time.Minute
	if len(parts) > 0 {
		switch strings.TrimSuffix(strings.ToLower(parts[len(parts)-1]), "s") {
		case "second":
			unit = time.Second
		case "hour":
			unit = time.Hour
		case "day":
			unit = 24 * time.Hour
		}
	}

	return time.Duration(amount) * unit
}
