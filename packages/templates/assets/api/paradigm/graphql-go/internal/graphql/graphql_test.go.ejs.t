---
to: internal/graphql/graphql_test.go
---
package graphql

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
)

func testEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	Install(r, &config.Config{Environment: "test", Port: <%= runtime.port %>, LogLevel: "info"})
	return r
}

// One operation through the whole transport: routing, context, resolver, serialisation. This is
// also where a resolver that disagrees with the schema surfaces — MustParseSchema panics inside
// Install with the field named, before any request is made.
func TestHealthQueryAnswers(t *testing.T) {
	w := httptest.NewRecorder()
	body := strings.NewReader(`{"query":"{ health { status service } }"}`)
	req := httptest.NewRequest(http.MethodPost, "/graphql", body)
	req.Header.Set("Content-Type", "application/json")
	testEngine().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /graphql returned %d, want 200", w.Code)
	}

	var response struct {
		Data struct {
			Health struct {
				Status  string `json:"status"`
				Service string `json:"service"`
			} `json:"health"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if len(response.Errors) != 0 {
		t.Fatalf("unexpected errors: %v", response.Errors)
	}
	if response.Data.Health.Status != "ok" || response.Data.Health.Service != "<%= spec.meta.slug %>" {
		t.Fatalf("health = %+v", response.Data.Health)
	}
}

// /schema.graphql is what the Service Catalog reads; it must be the schema the server runs.
func TestSchemaIsServedAsSDL(t *testing.T) {
	w := httptest.NewRecorder()
	testEngine().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/schema.graphql", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("GET /schema.graphql returned %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "type Query") {
		t.Fatalf("body does not look like SDL:\n%s", w.Body.String())
	}
}

// Validation failures come back in the GraphQL envelope, not the REST one.
func TestUnknownFieldIsAGraphQLError(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(`{"query":"{ nope }"}`))
	req.Header.Set("Content-Type", "application/json")
	testEngine().ServeHTTP(w, req)

	var response struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if len(response.Errors) == 0 || !strings.Contains(response.Errors[0].Message, "nope") {
		t.Fatalf("expected a validation error naming the field, got %s", w.Body.String())
	}
}
