---
to: <%= framework.sourceRoot %>components/ui/badge.tsx
---
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  success: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]',
  danger: 'bg-[hsl(var(--destructive))]/15 text-[hsl(var(--destructive))]',
  accent: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
};

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
