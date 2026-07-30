---
to: <%= framework.sourceRoot %>components/ui/input.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import TextField from '@mui/material/TextField';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'color'> {
  /** Renders the error state. Pair with `aria-describedby` pointing at your message. */
  invalid?: boolean;
}

/**
 * MUI's TextField, not its Input.
 *
 * TextField is the composed control — label, helper text, error state — and is what MUI's own
 * docs use everywhere. Using the bare Input would mean reimplementing the error styling that
 * `error` gives for free.
 *
 * `size` and `color` are omitted from the props: MUI defines both with its own meanings, and
 * passing an HTML `size` through would silently change the rendering.
 */
export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <TextField
      {...props}
      error={invalid ?? false}
      size="small"
      fullWidth
      variant="outlined"
      {...(className ? { className } : {})}
    />
  );
}
