---
to: <%= framework.sourceRoot %>components/ui/card.tsx
---
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * One props type for the whole family, and the same one in all three styling systems.
 *
 * It used to be `HTMLAttributes<HTMLDivElement>` here and `{ className, children }` in the other
 * two — and the other two exported only `Card`, with none of the sub-components. A page module
 * using `<CardHeader>` therefore compiled under Tailwind alone, and one importing `CardProps`
 * failed under Tailwind alone. `styling-api.test.ts` compares the three declarations now, so the
 * narrower shape is the shared one: a card is a container, and letting it take arbitrary DOM
 * handlers is not worth an API that only holds for one design system.
 */
export interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border border-[hsl(var(--border))]',
        'bg-[hsl(var(--background))] shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)}>{children}</div>;
}

export function CardTitle({ className, children }: CardProps) {
  return (
    <h3 className={cn('font-semibold leading-none tracking-tight', className)}>{children}</h3>
  );
}

export function CardDescription({ className, children }: CardProps) {
  return <p className={cn('text-sm text-[hsl(var(--muted-foreground))]', className)}>{children}</p>;
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn('p-6 pt-0', className)}>{children}</div>;
}

export function CardFooter({ className, children }: CardProps) {
  return <div className={cn('flex items-center p-6 pt-0', className)}>{children}</div>;
}
