---
to: <%= framework.sourceRoot %>lib/cn.ts
---
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, resolving Tailwind conflicts.
 *
 * `clsx` alone would emit both `px-2` and `px-4` when a caller overrides a component default,
 * and the winner would depend on stylesheet order rather than intent. `twMerge` keeps the last
 * one, which is what every caller expects.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
