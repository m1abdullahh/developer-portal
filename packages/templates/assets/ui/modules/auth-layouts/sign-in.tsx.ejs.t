---
to: <%= framework.routing === 'file-based' ? framework.sourceRoot + 'app/(auth)/sign-in/page.tsx' : framework.sourceRoot + 'pages/SignIn.tsx' %>
---
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/**
 * Sign-in.
 *
 * Imports only from `@/components/ui/*` — never from Tailwind, MUI or a stylesheet directly.
 * That single rule is what lets this page render under all three styling systems without a
 * per-system copy, and it is worth preserving as you edit.
 *
 * The submit handler is deliberately a stub. Authentication belongs to your API, and guessing at
 * its shape here would produce code that looks finished and does nothing.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Replace with your API call. A 401 should set an error rather than throw.
      throw new Error('Sign-in is not wired up yet — point this at your API.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Sign in</h1>
      <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: 0 }}>
        Welcome back to <%= spec.meta.projectName %>.
      </p>

      <Card className="mt-6">
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
            Email
            <Input
              type="email"
              name="email"
              value={email}
              required
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
            Password
            <Input
              type="password"
              name="password"
              value={password}
              required
              // `current-password`, not `new-password`: it tells a password manager to offer the
              // saved credential rather than to generate a replacement.
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? (
            <p role="alert" style={{ fontSize: '0.75rem', color: 'crimson', margin: 0 }}>
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>

      <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>
        <a href="/forgot-password">Forgot your password?</a> · <a href="/sign-up">Create an account</a>
      </p>
    </main>
  );
}
