---
to: <%= framework.sourceRoot %>components/ui/card.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import MuiCard from '@mui/material/Card';
import MuiCardActions from '@mui/material/CardActions';
import MuiCardContent from '@mui/material/CardContent';
import MuiCardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface CardProps {
  className?: string;
  children: ReactNode;
}

/**
 * The same six components the other two styling systems export.
 *
 * Only `Card` existed here for a while, so a page module using `<CardHeader>` compiled under
 * Tailwind and failed here — silently, because no module written up to that point used one.
 *
 * `Card` deliberately does NOT wrap its children in CardContent. It did, which meant a page
 * composing `<Card><CardHeader/><CardContent/></Card>` got padding twice and a header nested
 * inside a content region. Composition is the caller's to decide, exactly as in the other two.
 */
export function Card({ className, children }: CardProps) {
  return (
    // `variant="outlined"` rather than the default elevation: the other styling systems use a
    // border and a hairline shadow, and a raised MUI card would look like a different design.
    <MuiCard variant="outlined" {...(className ? { className } : {})}>
      {children}
    </MuiCard>
  );
}

export function CardHeader({ className, children }: CardProps) {
  // `title` rather than children: MUI's CardHeader renders children after its own title slot,
  // so passing them through would put the content in the wrong place.
  return <MuiCardHeader title={children} {...(className ? { className } : {})} />;
}

export function CardTitle({ className, children }: CardProps) {
  return (
    <Typography variant="h6" component="h3" {...(className ? { className } : {})}>
      {children}
    </Typography>
  );
}

export function CardDescription({ className, children }: CardProps) {
  return (
    <Typography variant="body2" color="text.secondary" {...(className ? { className } : {})}>
      {children}
    </Typography>
  );
}

export function CardContent({ className, children }: CardProps) {
  return <MuiCardContent {...(className ? { className } : {})}>{children}</MuiCardContent>;
}

export function CardFooter({ className, children }: CardProps) {
  return <MuiCardActions {...(className ? { className } : {})}>{children}</MuiCardActions>;
}
