---
to: <%= framework.sourceRoot %>components/ui/button.tsx
---
import type { ButtonHTMLAttributes } from 'react';
import styles from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Same props as every other styling system's Button — that identity is the contract, and it is
 * enforced by `styling-api.test.ts` rather than left to reviewers to notice.
 *
 * It once was not. `size` existed only here's Tailwind counterpart and the variant lists
 * disagreed (`default` against `primary`), so a page module passing either compiled under one
 * styling system and failed under the other two. Nothing caught it until a module actually used
 * them, because the modules written before that only ever passed children.
 *
 * Classes are composed by joining rather than with a `cn` helper: CSS Modules produces unique
 * names, so there are no conflicting utilities to resolve and last-wins ordering never arises.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: styles.sizeSm!,
  md: styles.sizeMd!,
  lg: styles.sizeLg!,
  icon: styles.sizeIcon!,
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={[styles.button, styles[variant], SIZES[size], className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
