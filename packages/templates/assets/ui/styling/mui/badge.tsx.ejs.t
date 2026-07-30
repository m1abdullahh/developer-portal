---
to: <%= framework.sourceRoot %>components/ui/badge.tsx
---
'use client';

import Chip from '@mui/material/Chip';
import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

/**
 * MUI calls this a Chip, and its `Badge` is something else entirely — a notification dot
 * positioned over another element. Mapping our name onto the right MUI component matters more
 * than matching its vocabulary.
 */
const TONES: Record<BadgeTone, 'default' | 'success' | 'warning' | 'error' | 'primary'> = {
  neutral: 'default',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  accent: 'primary',
};

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <Chip
      label={children}
      color={TONES[tone]}
      size="small"
      variant="outlined"
      {...(className ? { className } : {})}
    />
  );
}
