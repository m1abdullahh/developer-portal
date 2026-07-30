---
to: <%= framework.sourceRoot %>components/ui/input.tsx
---
import type { InputHTMLAttributes } from 'react';
import styles from './ui.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the error state. Pair with `aria-describedby` pointing at your message. */
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      {...props}
      // Announced as well as coloured — a red border alone is invisible to a screen reader and to
      // anyone who cannot distinguish the hue.
      aria-invalid={invalid || undefined}
      className={[styles.field, invalid && styles.invalid, className].filter(Boolean).join(' ')}
    />
  );
}
