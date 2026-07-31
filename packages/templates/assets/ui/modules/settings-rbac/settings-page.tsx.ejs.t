---
to: <%= framework.routing === 'file-based' ? framework.sourceRoot + 'app/settings/page.tsx' : framework.sourceRoot + 'pages/Settings.tsx' %>
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useState } from 'react';
import { ToastRegion, useToasts } from '@/components/ui/toast';
import {
  ApiKeysPanel,
  AuditPanel,
  OrganisationPanel,
  PermissionsPanel,
} from '@/components/settings/panels';

/**
 * Settings.
 *
 * The shell is a tab list and nothing else — each panel lives in `components/settings/panels.tsx`
 * and owns its own loading and error state. That split keeps this file readable as the number of
 * tabs grows, and means a panel can be reused elsewhere without dragging the shell with it.
 *
 * Tab state is local rather than in the URL. Deep-linking to a tab is worth adding if people start
 * sharing links to them; doing it now would mean choosing a router API that differs between
 * frameworks, which is exactly what this module is written to avoid.
 */
const TABS = [
  { id: 'organisation', label: 'Organisation' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'audit', label: 'Audit log' },
  { id: 'keys', label: 'API keys' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Settings() {
  const [active, setActive] = useState<TabId>('organisation');
  const { toasts, push, dismiss } = useToasts();

  const saved = (m: string) => push({ message: m, tone: 'success' });

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Settings</h1>
      <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: 0 }}>
        How <%= spec.meta.projectName %> is configured, and who may configure it.
      </p>

      {/* `tablist` / `tab` / `tabpanel` rather than styled buttons: it is what makes arrow-key
          navigation and screen-reader announcement work without reimplementing either. */}
      <div
        role="tablist"
        aria-label="Settings sections"
        style={{ display: 'flex', gap: '0.25rem', margin: '1.5rem 0 1rem' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            type="button"
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            style={{
              padding: '0.5rem 0.875rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              border: 0,
              borderBottom: active === tab.id ? '2px solid currentColor' : '2px solid transparent',
              background: 'none',
              color: 'inherit',
              opacity: active === tab.id ? 1 : 0.65,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'organisation' ? <OrganisationPanel onSaved={saved} /> : null}
        {active === 'permissions' ? <PermissionsPanel onSaved={saved} /> : null}
        {active === 'audit' ? <AuditPanel /> : null}
        {active === 'keys' ? <ApiKeysPanel onSaved={saved} /> : null}
      </div>

      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
