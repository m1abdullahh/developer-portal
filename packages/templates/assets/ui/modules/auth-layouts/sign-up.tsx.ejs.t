---
to: <%= framework.routing === 'file-based' ? framework.sourceRoot + 'app/(auth)/sign-up/page.tsx' : framework.sourceRoot + 'pages/SignUp.tsx' %>
---
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/** Registration. See the note in the sign-in page about the primitive-only import rule. */
export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Checked before the request rather than after: a round trip to be told the password is short
    // is a worse experience than an immediate answer, and the API must validate it regardless.
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      throw new Error('Registration is not wired up yet — point this at your API.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Create an account</h1>
      <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: 0 }}>
        Get started with <%= spec.meta.projectName %>.
      </p>

      <Card className="mt-6">
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
            Name
            <Input
              name="name"
              value={name}
              required
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

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
              minLength={12}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? (
            <p role="alert" style={{ fontSize: '0.75rem', color: 'crimson', margin: 0 }}>
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      </Card>

      <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>
        Already have an account? <a href="/sign-in">Sign in</a>
      </p>
    </main>
  );
}
