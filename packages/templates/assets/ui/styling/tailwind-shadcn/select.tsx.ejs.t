---
to: <%= framework.sourceRoot %>components/ui/select.tsx
---
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: readonly SelectOption[];
  /** Rendered as a disabled, selected-by-default first option. */
  placeholder?: string;
  invalid?: boolean;
}

/**
 * A native `<select>`, deliberately.
 *
 * A custom listbox gives more styling control and costs keyboard support, screen-reader
 * behaviour, and the mobile picker — all of which the platform gets right for free. Swap it for a
 * headless library only once a design genuinely requires it.
 */
export function Select({ className, options, placeholder, invalid, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 text-sm',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-[hsl(var(--destructive))]',
        className,
      )}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
