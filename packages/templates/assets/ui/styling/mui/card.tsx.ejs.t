---
to: <%= framework.sourceRoot %>components/ui/card.tsx
---
'use client';

import MuiCard from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import type { ReactNode } from 'react';

export interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    // `variant="outlined"` rather than the default elevation: the other styling systems use a
    // border and a hairline shadow, and a raised MUI card would look like a different design.
    <MuiCard variant="outlined" {...(className ? { className } : {})}>
      <CardContent>{children}</CardContent>
    </MuiCard>
  );
}
