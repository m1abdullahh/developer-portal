---
to: <%= framework.sourceRoot %>components/ui/input.tsx
---
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

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
      className={cn(
        'w-full rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 text-sm',
        'placeholder:text-[hsl(var(--muted-foreground))]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-[hsl(var(--destructive))]',
        className,
      )}
    />
  );
}
