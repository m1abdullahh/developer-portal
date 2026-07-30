---
to: <%= framework.sourceRoot %>components/ui/toast.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import styles from './ui.module.css';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface Toast {
  id: string;
  message: ReactNode;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Pass 0 to require an explicit dismissal. */
  duration?: number;
}

/**
 * Toast state, deliberately local rather than global.
 *
 * A module-level store would decide the project's state library for it — and this component set
 * is shared by four of them. Promote it to your own store if you later need to fire a toast from
 * anywhere.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'> & { id?: string }) => {
    const id = toast.id ?? `toast-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  return { toasts, push, dismiss };
}

export function ToastRegion({
  toasts,
  onDismiss,
  className,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
  className?: string;
}) {
  return (
    // `polite`, not `assertive`: a toast should be announced at the next natural pause rather
    // than interrupting whatever the user is reading.
    <div
      role="status"
      aria-live="polite"
      className={[styles.toastRegion, className].filter(Boolean).join(' ')}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/** A single toast. Exported so a page can render one outside the region if it needs to. */
export function Toast({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { id, duration = 5000 } = toast;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div className={styles.toast}>
      <span className={styles.toastMessage}>{toast.message}</span>
      <button type="button" onClick={() => onDismiss(id)} aria-label="Dismiss" className={styles.dismiss}>
        ×
      </button>
    </div>
  );
}
