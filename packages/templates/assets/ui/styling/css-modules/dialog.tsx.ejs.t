---
to: <%= framework.sourceRoot %>components/ui/dialog.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './ui.module.css';

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
 * `showModal()` gives focus trapping, background inertness, Escape-to-close and top-layer
 * stacking that defeats every `z-index` problem — all from the platform, none of it
 * reimplemented.
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() throws if already open, and close() on a closed dialog is a silent no-op — so
    // both are guarded on the element's own state, not just the prop.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires on Escape as well as close(), keeping the prop in sync with the platform's own
      // dismissal.
      onClose={onClose}
      // The backdrop is a pseudo-element, so a click outside lands on the dialog itself.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={[styles.dialog, className].filter(Boolean).join(' ')}
    >
      <div className={styles.dialogHeader}>
        <h2 id="dialog-title" className={styles.dialogTitle}>
          {title}
        </h2>
      </div>

      <div className={styles.dialogBody}>{children}</div>

      {footer ? <div className={styles.dialogFooter}>{footer}</div> : null}
    </dialog>
  );
}
