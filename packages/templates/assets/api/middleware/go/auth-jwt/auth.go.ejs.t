---
to: internal/middleware/auth.go
---
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/permissions"
)

type AuthenticatedUser struct {
	ID    string
	Email string
	Role  permissions.Role
}

const userKey = "auth_user"

// One generic 401 for every verification failure — deliberately not "expired" versus "malformed"
// versus "bad signature". Distinguishing them hands an attacker a free oracle: a signature error
// means the token structure was right and only the key was wrong, which is precisely the feedback
// a forging attempt needs. The WWW-Authenticate header names the scheme, not the fault.
func unauthorized(c *gin.Context) {
	c.Header("WWW-Authenticate", "Bearer")
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"error":      "Unauthorized",
		"message":    "Authentication required.",
		"statusCode": http.StatusUnauthorized,
	})
}

// authenticate verifies the bearer token and returns the user, aborting with 401 on any failure.
// It never calls c.Next() — that is the caller's decision, which is what lets RequirePermission
// run its own check between authentication and the handler.
func authenticate(c *gin.Context, cfg *config.Config) (AuthenticatedUser, bool) {
	header := c.GetHeader("Authorization")
	token, found := strings.CutPrefix(header, "Bearer ")
	if !found || token == "" {
		unauthorized(c)
		return AuthenticatedUser{}, false
	}

	claims := jwt.MapClaims{}
	// WithValidMethods is not optional and never includes "none". Accepting the algorithm named
	// in the token's own header is the classic JWT forgery: the attacker sets alg to none and
	// supplies no signature at all.
	_, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return []byte(cfg.JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		unauthorized(c)
		return AuthenticatedUser{}, false
	}

	role, _ := claims["role"].(string)
	if !permissions.IsRole(role) {
		// A token signed by us carrying a role we do not recognise is a policy change that has
		// not finished rolling out. Refusing is the safe direction.
		unauthorized(c)
		return AuthenticatedUser{}, false
	}

	subject, _ := claims["sub"].(string)
	if subject == "" {
		unauthorized(c)
		return AuthenticatedUser{}, false
	}

	email, _ := claims["email"].(string)
	return AuthenticatedUser{ID: subject, Email: email, Role: permissions.Role(role)}, true
}

// RequireAuth is a per-route guard:
//
//	r.GET("/private", middleware.RequireAuth(cfg), handler)
//
// Guards rather than global middleware because a global check would also intercept /health,
// /ready and /docs — the probes would return 401 and Kubernetes would restart a perfectly
// healthy pod.
func RequireAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := authenticate(c, cfg)
		if !ok {
			return
		}
		c.Set(userKey, user)
		c.Next()
	}
}

// RequirePermission authenticates and then checks the policy:
//
//	r.DELETE("/thing/:id", middleware.RequirePermission(cfg, permissions.PermissionDelete), handler)
func RequirePermission(cfg *config.Config, permission permissions.Permission) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := authenticate(c, cfg)
		if !ok {
			return
		}
		if !permissions.Has(user.Role, permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":      "Forbidden",
				"message":    "This action requires the '" + string(permission) + "' permission.",
				"statusCode": http.StatusForbidden,
			})
			return
		}
		c.Set(userKey, user)
		c.Next()
	}
}

// CurrentUser returns the user a guard stored. The zero value means no guard ran, which in a
// correctly-wired route cannot happen — guards abort before the handler.
func CurrentUser(c *gin.Context) AuthenticatedUser {
	value, _ := c.Get(userKey)
	user, _ := value.(AuthenticatedUser)
	return user
}
