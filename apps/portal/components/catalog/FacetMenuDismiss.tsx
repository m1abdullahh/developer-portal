'use client';

import { useEffect } from 'react';

const OPEN_MENU = 'details[name="catalog-facet"][open]';

/**
 * Closes the filter menus on an outside click and on Escape.
 *
 * The menus are plain `<details>` and work without this — it adds only the two dismissals a
 * native disclosure does not have, which are the two a person expects of anything that looks like
 * a dropdown. Escape returns focus to the button that opened the menu.
 */
export function FacetMenuDismiss() {
  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('details[name="catalog-facet"]')) return;
      for (const menu of document.querySelectorAll(OPEN_MENU)) menu.removeAttribute('open');
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      const menu = document.querySelector(OPEN_MENU);
      if (!menu) return;
      menu.removeAttribute('open');
      menu.querySelector('summary')?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return null;
}
