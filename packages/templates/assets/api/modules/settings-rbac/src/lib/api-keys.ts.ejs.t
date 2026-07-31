---
to: src/lib/api-keys.ts
---
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * API key generation and verification.
 *
 * ── Keys are stored hashed, never in plaintext ──────────────────────────────
 * The database holds a SHA-256 of the key and nothing else, so a leaked backup or a SQL injection
 * yields hashes rather than working credentials. The plaintext is returned exactly once, at
 * creation, and cannot be recovered afterwards — which is why the UI makes a point of showing it.
 *
 * SHA-256 rather than bcrypt or argon2, deliberately. Those are built to be slow because human
 * passwords are guessable; a 256-bit random key is not, so the slowness would buy nothing and cost
 * a KDF on every authenticated request. This is the same reasoning that applies to session tokens.
 */
const PREFIX_LENGTH = 8;

export interface GeneratedKey {
  /** Shown to the user once. Never stored. */
  plaintext: string;
  /** What goes in the database. */
  hash: string;
  /** The leading characters, stored so a key can be identified in a list without revealing it. */
  prefix: string;
}

export function generateApiKey(): GeneratedKey {
  // 32 bytes of CSPRNG output. base64url so the key is copy-pasteable and shell-safe.
  const plaintext = `sk_${randomBytes(32).toString('base64url')}`;

  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, PREFIX_LENGTH),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Constant-time comparison.
 *
 * `===` on a hash leaks how many leading characters matched through timing. That is a narrow
 * channel, but it is free to close and the alternative is explaining why it was left open.
 */
export function verifyApiKey(plaintext: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashApiKey(plaintext), 'hex');
  const expected = Buffer.from(storedHash, 'hex');

  // timingSafeEqual throws on a length mismatch, which is itself a leak — but both sides are
  // SHA-256 output here, so a mismatch means the stored value is corrupt, not that the guess
  // was the wrong length.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
