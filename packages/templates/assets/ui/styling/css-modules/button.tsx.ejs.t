---
to: <%= framework.sourceRoot %>components/ui/button.tsx
---
import type { ButtonHTMLAttributes } from 'react';
import styles from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Same props as every other styling system's Button — that identity is the contract.
 *
 * Classes are composed by joining rather than with a `cn` helper: CSS Modules produces unique
 * names, so there are no conflicting utilities to resolve and last-wins ordering never arises.
 */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
    />
  );
}
