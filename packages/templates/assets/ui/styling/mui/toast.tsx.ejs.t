---
to: <%= framework.sourceRoot %>components/ui/toast.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

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
 * Identical to the other styling systems' version on purpose — a module-level store would decide
 * the project's state library for it, and this component set is shared by four of them.
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

const SEVERITY: Record<ToastTone, 'info' | 'success' | 'error'> = {
  neutral: 'info',
  success: 'success',
  danger: 'error',
};

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
    // One Snackbar per toast would stack them on top of each other — MUI positions each one
    // absolutely. A single positioned Stack holding plain Alerts gives the list behaviour the
    // other styling systems have.
    <Stack
      role="status"
      aria-live="polite"
      spacing={1}
      sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400, width: 320 }}
      {...(className ? { className } : {})}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </Stack>
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
    <Alert severity={SEVERITY[toast.tone ?? 'neutral']} variant="outlined" onClose={() => onDismiss(id)}>
      {toast.message}
    </Alert>
  );
}
