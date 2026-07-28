---
to: app/layout.tsx
---
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '<%= spec.meta.projectName %>',
  description: <%- h.json(spec.meta.description ?? `${spec.meta.projectName} for ${spec.meta.clientName}`) %>,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
