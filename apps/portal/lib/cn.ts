import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, letting later Tailwind utilities win over earlier ones.
 *
 * Plain string concatenation breaks the moment a caller passes `px-6` to a component whose base
 * is `px-4`: both land in the class list and the winner is whichever CSS rule came last in the
 * stylesheet, not the one the caller intended.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
