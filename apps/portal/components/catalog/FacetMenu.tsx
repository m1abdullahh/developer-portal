import Link from 'next/link';
import { cn } from '../../lib/cn';
import {
  FACET_TITLES,
  catalogHref,
  toggleFacet,
  type CatalogQuery,
  type Facet,
  type FacetOption,
} from '../../lib/catalog';

/**
 * One filter, as a disclosure of links.
 *
 * Links rather than checkboxes and a script: each option's href *is* the view with that value
 * toggled, so the filter state lives in the URL by construction (doc 07 §2), the back button
 * undoes a filter, and the whole bar works before hydration. `name` makes the menus exclusive —
 * opening one closes the others — which is the only behaviour a script would have added.
 */
export function FacetMenu({
  facet,
  options,
  query,
}: {
  facet: Facet;
  options: readonly FacetOption[];
  query: CatalogQuery;
}) {
  const chosen = options.filter((option) => option.selected).length;

  return (
    <details name="catalog-facet" className="group relative">
      <summary
        className={cn(
          'focus-ring flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius)] border',
          'px-3 py-1.5 text-xs font-medium select-none hover:bg-[hsl(var(--muted))]',
          '[&::-webkit-details-marker]:hidden',
          chosen > 0 && 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]',
        )}
      >
        {FACET_TITLES[facet]}
        {chosen > 0 ? (
          <span className="rounded-full bg-[hsl(var(--accent))] px-1.5 text-[10px] text-[hsl(var(--accent-foreground))]">
            {chosen}
          </span>
        ) : null}
        <span aria-hidden className="text-[10px] transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      {/* In flow on a narrow screen, floating from `sm` up: a 16rem panel hung off a button near
          the right edge of a phone would push the page sideways. */}
      <ul
        aria-label={`${FACET_TITLES[facet]} filter`}
        className="z-20 mt-1 max-h-72 w-64 max-w-full overflow-auto rounded-[var(--radius)] border bg-[hsl(var(--card))] p-1 shadow-lg sm:absolute"
      >
        {options.length === 0 ? (
          <li className="px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            Nothing in the current view to filter by.
          </li>
        ) : null}
        {options.map((option) => (
          <li key={option.value}>
            <Link
              href={catalogHref(toggleFacet(query, facet, option.value))}
              scroll={false}
              aria-current={option.selected ? 'true' : undefined}
              className="focus-ring flex items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] leading-none',
                  option.selected &&
                    'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]',
                )}
              >
                {option.selected ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-[hsl(var(--muted-foreground))] tabular-nums">
                {option.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
