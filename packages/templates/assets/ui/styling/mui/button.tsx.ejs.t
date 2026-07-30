---
to: <%= framework.sourceRoot %>components/ui/button.tsx
---
'use client';

import MuiButton from '@mui/material/Button';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: ButtonVariant;
}

/**
 * MUI's Button also has a `variant` prop, with entirely different values
 * (`text` | `outlined` | `contained`). Ours wins and MUI's is mapped, not exposed — a component
 * whose props change meaning depending on the styling option would defeat the point of having a
 * shared primitive API.
 *
 * The escape hatch is to import from `@mui/material` directly, which is always available.
 */
const VARIANTS: Record<
  ButtonVariant,
  { variant: 'text' | 'outlined' | 'contained'; color: 'primary' | 'inherit' | 'error' }
> = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'outlined', color: 'inherit' },
  ghost: { variant: 'text', color: 'inherit' },
  destructive: { variant: 'contained', color: 'error' },
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const mapped = VARIANTS[variant];

  return (
    <MuiButton
      {...props}
      variant={mapped.variant}
      color={mapped.color}
      size="small"
      {...(className ? { className } : {})}
    />
  );
}
