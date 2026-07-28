'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Light/dark toggle.
 *
 * Reads the stored preference on mount rather than during render: the server has no way to know
 * it, so rendering the "real" theme on the server produces a hydration mismatch. The inline
 * script in the layout applies the class before first paint, which is what avoids a flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('idp-theme', next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle colour theme"
      className="focus-ring rounded-[var(--radius)] border px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
    >
      {/* Renders a stable placeholder until the effect has run, so server and client markup match. */}
      {theme === null ? '·' : theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
