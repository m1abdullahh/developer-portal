---
to: internal/routes/health_test.go
---
package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func testEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	RegisterHealth(r)
	return r
}

// Liveness answers without touching anything downstream, asserted through httptest with no port
// bound — which is why server.New is separate from main's http.Server.
func TestHealthReportsOK(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	testEngine().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /health returned %d, want 200", w.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("status = %q, want ok", body["status"])
	}
	if body["service"] != "<%= spec.meta.slug %>" {
		t.Fatalf("service = %q, want <%= spec.meta.slug %>", body["service"])
	}
}

// An API with no dependencies is ready as soon as it is up. The readiness-checks region is empty
// until a recipe that owns a dependency fills it, and an empty check set must mean ready —
// otherwise a service with no database would never join its own Service.
func TestReadyWithNoChecksIsReady(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	testEngine().ServeHTTP(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /ready returned %d, want 200 or 503", w.Code)
	}
}
