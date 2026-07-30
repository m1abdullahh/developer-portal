---
to: <%= framework.sourceRoot %>components/ui/badge.tsx
---
import type { ReactNode } from 'react';
import styles from './ui.module.css';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
