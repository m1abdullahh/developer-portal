---
to: <%= framework.sourceRoot %>components/ui/select.tsx
---
import styles from './ui.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  /**
   * Receives the value, not a DOM event.
   *
   * Deliberate: extending `SelectHTMLAttributes<HTMLSelectElement>` would bake an element type
   * into an API that every styling system has to satisfy, and not all of them render a real
   * `<select>` — MUI uses a div. Passing the value is the shape that survives all three.
   */
  onValueChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * A native `<select>`, deliberately.
 *
 * A custom listbox gives more styling control and costs keyboard support, screen-reader
 * behaviour and the mobile picker — all of which the platform gets right for free.
 */
export function Select({
  className,
  options,
  placeholder,
  invalid,
  onValueChange,
  ...props
}: SelectProps) {
  return (
    <select
      {...props}
      onChange={(event) => onValueChange?.(event.target.value)}
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
