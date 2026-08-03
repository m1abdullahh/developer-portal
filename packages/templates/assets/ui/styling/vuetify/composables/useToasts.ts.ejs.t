---
to: <%= framework.sourceRoot %>composables/useToasts.ts
---
import { ref } from 'vue';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface Toast {
  id: string;
  message: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Pass 0 to require an explicit dismissal. */
  duration?: number;
}

/**
 * Toast state, shared across the application.
 *
 * Module-level rather than per-caller, which is the opposite of the React implementations' local
 * hook — deliberately. React's stays local because that component set ships to four different
 * state libraries and a module-level store would decide that choice for the project. Nuxt has no
 * such ambiguity: app/composables/ is auto-imported and one shared ref is idiomatic, so a toast
 * can be fired from anywhere without threading a provider through.
 */
const toasts = ref<Toast[]>([]);

let counter = 0;

export function useToasts() {
  function dismiss(id: string) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function push(toast: Omit<Toast, 'id'> & { id?: string }) {
    // A counter, not Math.random(): this module is evaluated on the server during SSR as well as
    // in the browser, and a random id generated in each place makes Vue's hydration mismatch
    // warning fire on the first toast rendered server-side.
    const id = toast.id ?? 'toast-' + ++counter;
    toasts.value = [...toasts.value, { ...toast, id }];
    return id;
  }

  return { toasts, push, dismiss };
}
