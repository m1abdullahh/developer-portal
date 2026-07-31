---
to: <%= framework.sourceRoot %>components/ui/button.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import MuiButton from '@mui/material/Button';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
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
  // Distinct from `secondary` in intent even though both render outlined here: secondary is a
  // lesser action, outline is a neutral one. Keeping them separate matters because the other two
  // styling systems do draw them differently.
  outline: { variant: 'outlined', color: 'inherit' },
  ghost: { variant: 'text', color: 'inherit' },
  destructive: { variant: 'contained', color: 'error' },
};

/** MUI has three sizes and no icon size; `icon` maps to small and is squared off below. */
const SIZES: Record<ButtonSize, 'small' | 'medium' | 'large'> = {
  sm: 'small',
  md: 'medium',
  lg: 'large',
  icon: 'small',
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const mapped = VARIANTS[variant];

  return (
    <MuiButton
      {...props}
      variant={mapped.variant}
      color={mapped.color}
      size={SIZES[size]}
      // `minWidth: 0` undoes MUI's 64px floor, which would otherwise make an icon button a
      // rectangle rather than a square.
      {...(size === 'icon' ? { sx: { minWidth: 0, width: 40, height: 40, padding: 0 } } : {})}
      {...(className ? { className } : {})}
    />
  );
}
