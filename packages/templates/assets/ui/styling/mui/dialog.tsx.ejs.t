---
to: <%= framework.sourceRoot %>components/ui/dialog.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import type { ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * MUI's Dialog rather than the native element the other two systems use.
 *
 * Its focus trapping, scroll locking and backdrop are already built and integrated with MUI's
 * transitions — reimplementing them on `<dialog>` here would fight the library rather than use it.
 * The observable behaviour is the same: Escape and backdrop clicks both close.
 *
 * MUI's `onClose` receives the event and a reason; ours takes neither, so the signature is
 * narrowed rather than passed through.
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  return (
    <MuiDialog
      open={open}
      onClose={() => onClose()}
      fullWidth
      maxWidth="sm"
      {...(className ? { className } : {})}
    >
      <DialogTitle sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
      {footer ? <DialogActions>{footer}</DialogActions> : null}
    </MuiDialog>
  );
}
