---
to: <%= framework.routing === 'file-based' ? framework.sourceRoot + 'app/(auth)/forgot-password/page.tsx' : framework.sourceRoot + 'pages/ForgotPassword.tsx' %>
---
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/** Password reset request. See the note in the sign-in page about the primitive-only import rule. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      // Replace with your API call.
    } finally {
      setSubmitting(false);
      /*
       * Always reports success, even for an address with no account.
       *
       * Distinguishing the two turns this form into an account-enumeration oracle: anyone can
       * discover which email addresses are registered. Say the same thing either way and send the
       * mail only when there is somewhere to send it.
       */
      setSent(true);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Reset your password</h1>

      {sent ? (
        <Card className="mt-6">
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </p>
        </Card>
      ) : (
        <>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: 0 }}>
            We will email you a link to choose a new one.
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

              <Button type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          </Card>
        </>
      )}

      <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>
        <a href="/sign-in">Back to sign in</a>
      </p>
    </main>
  );
}
