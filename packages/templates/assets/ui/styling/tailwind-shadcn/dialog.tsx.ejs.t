---
to: <%= framework.sourceRoot %>components/ui/dialog.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Built on the native `<dialog>` element.
 *
 * `showModal()` gives focus trapping, inertness of the background, Escape-to-close and the
 * top-layer stacking that defeats every `z-index` problem — all from the platform, none of it
 * reimplemented. A div-based modal has to rebuild each of those and usually gets focus wrong.
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() throws if the dialog is already open, and close() on a closed dialog is a
    // silent no-op — so both are guarded on the element's own state, not just the prop.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires on Escape as well as close(), which is what keeps the prop in sync with the
      // platform's own dismissal.
      onClose={onClose}
      // The backdrop is a pseudo-element, so a click outside lands on the dialog itself. This
      // compares against the element to avoid closing on clicks inside the content.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        'w-full max-w-lg rounded-[var(--radius)] border bg-[hsl(var(--card))] p-0 text-[hsl(var(--foreground))]',
        'backdrop:bg-black/50',
        className,
      )}
    >
      <div className="border-b px-5 py-3">
        <h2 id="dialog-title" className="text-sm font-semibold">
          {title}
        </h2>
      </div>

      <div className="px-5 py-4 text-sm">{children}</div>

      {footer ? <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
