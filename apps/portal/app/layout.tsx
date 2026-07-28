import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import { currentUser } from '../lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'Internal Developer Portal',
  description: 'Self-service project provisioning and service catalog.',
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders light, hydrates, then flips to dark — a visible flash on every
 * navigation for anyone using dark mode. It has to be inline and synchronous in <head>; a React
 * effect necessarily runs after the first paint has already happened.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('idp-theme');
  var dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Never throws: an unconfigured or unreachable auth provider must still render the shell,
  // signed out, rather than turning every page into an error.
  const user = await currentUser().catch(() => null);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
