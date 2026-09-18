'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { catalogSearchString } from '../../lib/catalog';
import { Input } from '../ui';

const DEBOUNCE_MS = 300;

/**
 * The search box. Debounced, and the search itself happens on the server: typing moves `q` in the
 * URL, the page re-renders with the matching services, and the link in the address bar is the
 * search — there is no client-side copy of the fleet to go stale.
 *
 * It is a real GET form underneath, with the other parameters as hidden inputs, so pressing Enter
 * works before hydration and without JavaScript.
 */
export function CatalogSearch({
  initial,
  params,
}: {
  initial: string;
  /** Every other parameter of the current view, so searching keeps the filters and sort. */
  params: ReadonlyArray<readonly [string, string]>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What this box last sent to the URL. When `initial` differs from it, the change came from
  // somewhere else — "Clear all", the back button — and the box follows; when it matches, the
  // change is our own echo and must not overwrite what has been typed since.
  const lastSent = useRef(initial);

  useEffect(() => {
    if (initial !== lastSent.current) {
      lastSent.current = initial;
      setValue(initial);
    }
  }, [initial]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function navigate(next: string): void {
    const q = next.trim().replace(/\s+/g, ' ');
    lastSent.current = q;
    // The same serialiser the links use, so a view has one address however it was reached.
    const search = catalogSearchString(q === '' ? params : [['q', q], ...params]);
    startTransition(() => {
      router.replace(search === '' ? '/catalog' : `/catalog?${search}`, { scroll: false });
    });
  }

  return (
    <form
      action="/catalog"
      role="search"
      className="relative w-full max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate(value);
      }}
    >
      {params.map(([key, val]) => (
        <input key={`${key}=${val}`} type="hidden" name={key} value={val} />
      ))}
      <label htmlFor="catalog-search" className="sr-only">
        Search services
      </label>
      <Input
        id="catalog-search"
        name="q"
        type="search"
        autoComplete="off"
        value={value}
        placeholder="Search name, ID, client, description or tag"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
        }}
      />
      <span aria-live="polite" className="sr-only">
        {pending ? 'Searching' : ''}
      </span>
    </form>
  );
}
