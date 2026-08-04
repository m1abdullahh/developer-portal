---
to: cmd/api/main.go
---
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/logging"
	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/server"
	// >>> idp:imports
	// <<< idp:imports
)

func main() {
	// Parsed once at boot, so a missing or malformed variable stops the process here with the key
	// named — rather than surfacing as a zero value inside one request handler on the one code
	// path that reads it.
	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(1)
	}

	logging.Setup(cfg)

	// >>> idp:startup
	// <<< idp:startup

	srv := &http.Server{
		Addr:    ":" + strconv.Itoa(cfg.Port),
		Handler: server.New(cfg),
		// Without this an idle client holding a half-sent request header pins a connection
		// forever, which is the cheapest denial-of-service there is.
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("listening", "port", cfg.Port, "env", cfg.Environment)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	// SIGTERM is what Kubernetes sends when a pod is terminating. Draining in-flight requests
	// before exiting is what makes a rolling update not drop the requests already in progress on
	// each terminating pod.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("forced shutdown", "err", err)
	}

	// >>> idp:shutdown
	// <<< idp:shutdown

	slog.Info("stopped")
}
