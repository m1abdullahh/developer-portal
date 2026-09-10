---
to: internal/cache/redis.go
---
// Package cache is the Redis layer: a shared client, the readiness check, and cache-aside with
// stampede protection. The rate limiter keeps its counters here too when both are selected.
package cache

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/<%= spec.meta.repo.org %>/<%= spec.meta.slug %>/internal/config"
)

var (
	client *redis.Client

	errNotOpen = errors.New("redis: client not opened")

	// One mutex per key being loaded — see Cached.
	locksMu sync.Mutex
	locks   = map[string]*sync.Mutex{}
)

// Open parses REDIS_URL and builds the client. Nothing dials here: go-redis connects on the first
// command, so a service whose Redis is briefly unavailable still boots and serves /health while
// /ready reports the dependency. Short timeouts so a command against a down Redis fails in about a
// second rather than hanging the request that made it.
func Open(cfg *config.Config) error {
	options, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	options.DialTimeout = 2 * time.Second
	options.ReadTimeout = time.Second
	options.WriteTimeout = time.Second
	options.MaxRetries = 1
	client = redis.NewClient(options)
	return nil
}

// Client returns the shared client. Nil before Open, which main calls before serving.
func Client() *redis.Client {
	return client
}

// Check reports whether Redis answers PING within a second. Used by /ready; never by /health.
func Check(ctx context.Context) error {
	if client == nil {
		return errNotOpen
	}
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return client.Ping(ctx).Err()
}

// Close releases the client's connections. Safe before Open.
func Close() {
	if client != nil {
		_ = client.Close()
	}
}

// Cached is cache-aside: a hit returns the stored value; a miss calls load, stores the result with
// the TTL and returns it. Concurrent misses for one key in this process wait for a single load
// rather than each hitting the source — the stampede that turns a popular key's expiry into a
// traffic spike wherever the data comes from.
//
// Every Redis operation fails open: a read error is a miss, a write error is logged and skipped.
// A cache outage costs cache hits, never requests.
func Cached[T any](ctx context.Context, key string, ttl time.Duration, load func(context.Context) (T, error)) (T, error) {
	if value, ok := get[T](ctx, key); ok {
		return value, nil
	}

	lock := keyLock(key)
	lock.Lock()
	defer func() {
		lock.Unlock()
		locksMu.Lock()
		delete(locks, key)
		locksMu.Unlock()
	}()

	// Another goroutine may have filled the key while this one waited for the lock.
	if value, ok := get[T](ctx, key); ok {
		return value, nil
	}

	value, err := load(ctx)
	if err != nil {
		var zero T
		return zero, err
	}
	if raw, err := json.Marshal(value); err == nil && client != nil {
		if err := client.Set(ctx, key, raw, ttl).Err(); err != nil {
			slog.Warn("cache write failed", "key", key, "err", err)
		}
	}
	return value, nil
}

// Invalidate drops entries when the source changes. A cache that is never invalidated is a stale
// copy with a timer.
func Invalidate(ctx context.Context, keys ...string) {
	if client == nil || len(keys) == 0 {
		return
	}
	if err := client.Del(ctx, keys...).Err(); err != nil {
		slog.Warn("cache invalidate failed", "keys", keys, "err", err)
	}
}

func get[T any](ctx context.Context, key string) (T, bool) {
	var zero T
	if client == nil {
		return zero, false
	}
	raw, err := client.Get(ctx, key).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			slog.Warn("cache read failed; loading from source", "key", key, "err", err)
		}
		return zero, false
	}
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		return zero, false
	}
	return value, true
}

func keyLock(key string) *sync.Mutex {
	locksMu.Lock()
	defer locksMu.Unlock()
	lock, ok := locks[key]
	if !ok {
		lock = &sync.Mutex{}
		locks[key] = lock
	}
	return lock
}
