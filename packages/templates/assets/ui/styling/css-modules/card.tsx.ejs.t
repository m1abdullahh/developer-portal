---
to: <%= framework.sourceRoot %>components/ui/card.tsx
---
import type { ReactNode } from 'react';
import styles from './ui.module.css';

export interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return <div className={[styles.card, className].filter(Boolean).join(' ')}>{children}</div>;
}
