---
to: internal/middleware/validation.go
---
package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

// Bind decodes and validates a JSON request body, writing the shared 422 envelope on failure:
//
//	var req CreateWidgetRequest
//	if !middleware.Bind(c, &req) {
//		return
//	}
//
// gin already validates through go-playground/validator's struct tags — that needs no help. What
// it does not do is agree with the Node and Python services next to it: its default failure is a
// bare 400 whose message is the validator's internal error string. The envelope below is
// contractual — error, message, statusCode, details — with details[].field a path a form can look
// up directly.
//
// 422 rather than 400 distinguishes well-formed-but-invalid from malformed, which is a
// distinction a client can act on.
func Bind(c *gin.Context, target any) bool {
	err := c.ShouldBindJSON(target)
	if err == nil {
		return true
	}

	details := []gin.H{}
	var validationErrors validator.ValidationErrors
	if errors.As(err, &validationErrors) {
		for _, fieldError := range validationErrors {
			details = append(details, gin.H{
				"field":   strings.ToLower(fieldError.Field()),
				"message": "failed the '" + fieldError.Tag() + "' rule",
			})
		}
	} else {
		// Malformed JSON rather than invalid values. Still the same envelope, still 422 — the
		// client's handling code should not need two paths.
		details = append(details, gin.H{"field": "", "message": err.Error()})
	}

	c.AbortWithStatusJSON(http.StatusUnprocessableEntity, gin.H{
		"error":      "Unprocessable Entity",
		"message":    "Request validation failed.",
		"statusCode": http.StatusUnprocessableEntity,
		"details":    details,
	})
	return false
}
