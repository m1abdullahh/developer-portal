---
to: <%= framework.sourceRoot %>components/ui/select.tsx
---
import type { SelectHTMLAttributes } from 'react';
import styles from './ui.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

/**
 * A native `<select>`, deliberately.
 *
 * A custom listbox gives more styling control and costs keyboard support, screen-reader
 * behaviour and the mobile picker — all of which the platform gets right for free.
 */
export function Select({ className, options, placeholder, invalid, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={[styles.field, invalid && styles.invalid, className].filter(Boolean).join(' ')}
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
