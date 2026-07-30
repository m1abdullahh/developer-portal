---
to: <%= framework.sourceRoot %>components/ui/select.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

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
   * Deliberate, and learned the hard way: extending `SelectHTMLAttributes<HTMLSelectElement>`
   * bakes an element type into an API that three implementations have to satisfy. MUI's TextField
   * renders a div, so every inherited handler type collides with it. Passing the value is the
   * shape that survives all three.
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
 * The sharpest edge in the contract.
 *
 * MUI's Select takes `children` — a list of MenuItem elements — while this API takes `options`.
 * Keeping our shape means building the children here, which is exactly the translation the
 * primitive API exists to absorb: a page module written against `options` renders correctly under
 * all three styling systems without knowing any of this.
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
    <TextField
      {...props}
      select
      onChange={(event) => onValueChange?.(event.target.value)}
      error={invalid ?? false}
      size="small"
      fullWidth
      variant="outlined"
      {...(className ? { className } : {})}
    >
      {placeholder ? (
        <MenuItem value="" disabled>
          {placeholder}
        </MenuItem>
      ) : null}
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value} disabled={option.disabled ?? false}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
