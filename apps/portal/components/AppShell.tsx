import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PortalUser } from '../lib/session';
import { ThemeToggle } from './ThemeToggle';
import { Badge } from './ui';

/** The frame every page renders inside — navigation, identity, theme. */
export function AppShell({ user, children }: { user: PortalUser | null; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="focus-ring text-sm font-semibold">
            Internal Developer Portal
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/catalog">Catalog</NavLink>
            <NavLink href="/new">New project</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-[hsl(var(--muted-foreground))]">{user.login}</span>
                <Badge tone={user.role === 'viewer' ? 'neutral' : 'accent'}>{user.role}</Badge>
              </span>
            ) : (
              <Link href="/signin" className="focus-ring text-xs underline underline-offset-4">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring rounded-[var(--radius)] px-3 py-1.5 hover:bg-[hsl(var(--muted))]"
    >
      {children}
    </Link>
  );
}
