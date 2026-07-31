---
to: <%= framework.sourceRoot %>components/ui/card.tsx
---
import type { ReactNode } from 'react';
import styles from './ui.module.css';

export interface CardProps {
  className?: string;
  children: ReactNode;
}

/**
 * The same six components the other two styling systems export, with the same padding rules.
 *
 * `Card` is an unpadded frame: border, radius, background, hairline shadow. Padding belongs to
 * `CardContent`. That split matters because it used to differ per system — Tailwind's Card had no
 * padding while this one and MUI's did, so the identical markup rendered with padding under two
 * systems and none under the third. The API matched; the output did not.
 */
export function Card({ className, children }: CardProps) {
  return <div className={[styles.card, className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardHeader({ className, children }: CardProps) {
  return <div className={[styles.cardHeader, className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardTitle({ className, children }: CardProps) {
  return <h3 className={[styles.cardTitle, className].filter(Boolean).join(' ')}>{children}</h3>;
}

export function CardDescription({ className, children }: CardProps) {
  return (
    <p className={[styles.cardDescription, className].filter(Boolean).join(' ')}>{children}</p>
  );
}

export function CardContent({ className, children }: CardProps) {
  return (
    <div className={[styles.cardContent, className].filter(Boolean).join(' ')}>{children}</div>
  );
}

export function CardFooter({ className, children }: CardProps) {
  return <div className={[styles.cardFooter, className].filter(Boolean).join(' ')}>{children}</div>;
}
