---
to: <%= framework.sourceRoot %>components/ui/toast.tsx
---
'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface Toast {
  id: string;
  message: ReactNode;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Pass 0 to require an explicit dismissal. */
  duration?: number;
}

const TONES: Record<ToastTone, string> = {
  neutral: 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
  success: 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10',
  danger: 'border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10',
};

/**
 * Toast state, deliberately local rather than global.
 *
 * A module-level store would decide the project's state library for it — and this component set
 * is shared by four of them. Call this hook where you need toasts and render `<ToastRegion>`
 * alongside; promote it to your own store if you later need to fire one from anywhere.
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
      className={cn('fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2', className)}
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
    <div
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm shadow-sm',
        TONES[toast.tone ?? 'neutral'],
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
        className="text-[hsl(var(--muted-foreground))] hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}
