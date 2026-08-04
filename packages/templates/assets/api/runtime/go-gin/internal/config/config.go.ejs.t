---
to: internal/config/config.go
---
// Package config is the Go counterpart of the Zod schema the Node runtime uses and the
// pydantic-settings model the Python one does: the whole environment is read and validated in one
// place, at boot, and nothing else in the codebase touches os.Getenv.
package config

import (
	"fmt"
	"os"
	"strconv"
	// >>> idp:imports
	// <<< idp:imports
)

type Config struct {
	Environment string
	Port        int
	LogLevel    string
	// >>> idp:config-fields
	// <<< idp:config-fields
}

// Load parses the environment once. A missing or malformed variable fails here, with the key
// named, which is a better place to discover it than inside the one request that reads it.
func Load() (*Config, error) {
	cfg := &Config{
		Environment: getString("ENVIRONMENT", "development"),
		Port:        getInt("PORT", <%= runtime.port %>),
		LogLevel:    getString("LOG_LEVEL", "info"),
	}

	if cfg.Port < 1 || cfg.Port > 65535 {
		return nil, fmt.Errorf("PORT must be between 1 and 65535, got %d", cfg.Port)
	}

	// >>> idp:env-schema
	// <<< idp:env-schema

	return cfg, nil
}

func getString(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		// Returning the fallback here would silently ignore a typo'd value; an impossible
		// sentinel makes Load's range check report it instead.
		return -1
	}
	return parsed
}
