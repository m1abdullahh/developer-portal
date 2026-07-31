---
to: <%= framework.sourceRoot %>components/settings/panels.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, type Column } from '@/components/ui/table';
import {
  ApiError,
  PERMISSIONS,
  ROLES,
  createApiKey,
  getApiKeys,
  getAuditLog,
  getPermissions,
  getSettings,
  revokeApiKey,
  savePermissions,
  updateSettings,
  type ApiKey,
  type AuditEntry,
  type CreatedApiKey,
  type OrgSettings,
  type PermissionEntry,
  type Role,
} from '@/lib/settings-api';

/**
 * The four settings panels.
 *
 * Kept apart from the shell so the page file stays a tab list and nothing else. Every panel imports
 * only from `@/components/ui/*` and `@/lib/settings-api`, which is what lets them render under
 * Tailwind, CSS Modules or MUI unchanged.
 */

const message = (cause: unknown, fallback: string): string =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

// ── organisation ─────────────────────────────────────────────────────────────

export function OrganisationPanel({ onSaved }: { onSaved: (m: string) => void }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((cause: unknown) => setError(message(cause, 'Could not load settings.')));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;

    setSaving(true);
    setError(null);
    try {
      setSettings(
        await updateSettings({
          name: settings.name,
          allowedEmailDomain: settings.allowedEmailDomain,
          defaultRole: settings.defaultRole,
          requireApproval: settings.requireApproval,
        }),
      );
      onSaved('Settings saved.');
    } catch (cause) {
      setError(message(cause, 'Could not save those settings.'));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <Card><CardContent>{error ?? 'Loading…'}</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
        <CardDescription>How accounts are created and what they get by default.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
            Name
            <Input
              value={settings.name}
              required
              onChange={(event) => setSettings({ ...settings, name: event.target.value })}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
            Allowed email domain
            <Input
              value={settings.allowedEmailDomain ?? ''}
              placeholder="example.com"
              onChange={(event) =>
                setSettings({ ...settings, allowedEmailDomain: event.target.value || null })
              }
            />
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              Leave empty to trust no domain. Anyone with an address here can be approved
              automatically.
            </span>
          </label>

          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
            Default role for new accounts
            <Select
              value={settings.defaultRole}
              // `owner` is absent: a default that grants ownership to every sign-up is not
              // something anyone wants, and the API rejects it too.
              options={ROLES.filter((r) => r !== 'owner').map((r) => ({ value: r, label: title(r) }))}
              onValueChange={(value) => setSettings({ ...settings, defaultRole: value as Role })}
            />
          </label>

          <label style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={settings.requireApproval}
              onChange={(event) =>
                setSettings({ ...settings, requireApproval: event.target.checked })
              }
            />
            Require an administrator to approve new accounts
          </label>

          {error ? (
            <p role="alert" style={{ fontSize: '0.75rem', color: 'crimson', margin: 0 }}>
              {error}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── permissions ──────────────────────────────────────────────────────────────

export function PermissionsPanel({ onSaved }: { onSaved: (m: string) => void }) {
  const [entries, setEntries] = useState<PermissionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPermissions()
      .then(setEntries)
      .catch((cause: unknown) => setError(message(cause, 'Could not load the matrix.')));
  }, []);

  function toggle(role: Role, permission: string) {
    setEntries((current) =>
      (current ?? []).map((entry) =>
        entry.role === role && entry.permission === permission
          ? { ...entry, allowed: !entry.allowed, isDefault: false }
          : entry,
      ),
    );
  }

  async function onSave() {
    if (!entries) return;
    setSaving(true);
    setError(null);
    try {
      setEntries(await savePermissions(entries));
      onSaved('Permissions saved.');
    } catch (cause) {
      // The server refuses a matrix that leaves nobody able to manage settings. Showing that
      // message verbatim is the point — it says exactly what to do about it.
      setError(message(cause, 'Could not save the matrix.'));
    } finally {
      setSaving(false);
    }
  }

  if (!entries) {
    return <Card><CardContent>{error ?? 'Loading…'}</CardContent></Card>;
  }

  const at = (role: Role, permission: string) =>
    entries.find((e) => e.role === role && e.permission === permission);

  const columns: Column<string>[] = [
    {
      key: 'permission',
      header: 'Permission',
      cell: (permission) => <code style={{ fontSize: '0.8125rem' }}>{permission}</code>,
    },
    ...ROLES.map(
      (role): Column<string> => ({
        key: role,
        header: title(role),
        align: 'right',
        cell: (permission) => {
          const entry = at(role, permission);
          return (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
              <input
                type="checkbox"
                checked={entry?.allowed ?? false}
                onChange={() => toggle(role, permission)}
                aria-label={`${role} may ${permission}`}
              />
              {/* Marks anything an administrator has moved away from the shipped policy, so a
                  surprising grant is traceable to a decision rather than to a default. */}
              {entry && !entry.isDefault ? <Badge tone="warning">changed</Badge> : null}
            </label>
          );
        },
      }),
    ),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>
          Defaults come from <code>lib/permissions.ts</code>, which the API enforces and this app
          reads. Only your changes are stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table
          columns={columns}
          rows={[...PERMISSIONS]}
          rowKey={(permission) => permission}
          empty="No permissions are defined."
        />

        {error ? (
          <p role="alert" style={{ fontSize: '0.8125rem', color: 'crimson' }}>
            {error}
          </p>
        ) : null}

        <div style={{ marginTop: '1rem' }}>
          <Button onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save matrix'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── audit log ────────────────────────────────────────────────────────────────

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog()
      .then((page) => {
        setEntries(page.data);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => setError(message(cause, 'Could not load the audit log.')))
      .finally(() => setLoading(false));
  }, []);

  async function more() {
    if (!cursor) return;
    const page = await getAuditLog({ cursor });
    setEntries((current) => [...current, ...page.data]);
    setCursor(page.nextCursor);
  }

  const columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'When', cell: (e) => new Date(e.createdAt).toLocaleString() },
    { key: 'who', header: 'Who', cell: (e) => e.actorId },
    { key: 'what', header: 'What', cell: (e) => <code>{e.action}</code> },
    { key: 'detail', header: 'Detail', cell: (e) => e.detail ?? '—' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Append-only. There is no endpoint that edits or removes an entry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" style={{ fontSize: '0.875rem', color: 'crimson' }}>
            {error}
          </p>
        ) : (
          <Table
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.id}
            empty={loading ? 'Loading…' : 'Nothing has been recorded yet.'}
          />
        )}

        {cursor ? (
          <div style={{ marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => void more()}>
              Load more
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── api keys ─────────────────────────────────────────────────────────────────

export function ApiKeysPanel({ onSaved }: { onSaved: (m: string) => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  useEffect(() => {
    getApiKeys()
      .then(setKeys)
      .catch((cause: unknown) => setError(message(cause, 'Could not load API keys.')))
      .finally(() => setLoading(false));
  }, []);

  async function onRevoke(key: ApiKey) {
    const previous = keys;
    setKeys((current) => current.map((k) => (k.id === key.id ? { ...k, revokedAt: 'now' } : k)));
    try {
      const revoked = await revokeApiKey(key.id);
      setKeys((current) => current.map((k) => (k.id === key.id ? revoked : k)));
      onSaved(`${key.name} revoked.`);
    } catch (cause) {
      setKeys(previous);
      setError(message(cause, 'Could not revoke that key.'));
    }
  }

  const columns: Column<ApiKey>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (key) => (
        <div>
          <div>{key.name}</div>
          <code style={{ fontSize: '0.75rem', opacity: 0.7 }}>{key.prefix}…</code>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (key) =>
        key.revokedAt ? (
          <Badge tone="danger">Revoked</Badge>
        ) : key.expiresAt && new Date(key.expiresAt) < new Date() ? (
          <Badge tone="warning">Expired</Badge>
        ) : (
          <Badge tone="success">Active</Badge>
        ),
    },
    {
      key: 'used',
      header: 'Last used',
      cell: (key) => (key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (key) =>
        key.revokedAt ? null : (
          <Button variant="destructive" size="sm" onClick={() => void onRevoke(key)}>
            Revoke
          </Button>
        ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Stored hashed. A key is shown once, when it is created, and cannot be recovered
          afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" style={{ fontSize: '0.875rem', color: 'crimson' }}>
            {error}
          </p>
        ) : (
          <Table
            columns={columns}
            rows={keys}
            rowKey={(key) => key.id}
            empty={loading ? 'Loading…' : 'No keys yet.'}
          />
        )}

        <div style={{ marginTop: '1rem' }}>
          <Button onClick={() => setCreating(true)}>Create key</Button>
        </div>
      </CardContent>

      <CreateKeyDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(key) => {
          setKeys((current) => [key, ...current]);
          setCreated(key);
          setCreating(false);
        }}
      />

      <RevealKeyDialog created={created} onClose={() => setCreated(null)} />
    </Card>
  );
}

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onCreated(
        await createApiKey({
          name,
          ...(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
        }),
      );
      setName('');
    } catch (cause) {
      setError(message(cause, 'Could not create that key.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create an API key"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-api-key" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="create-api-key" onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
          Name
          <Input
            value={name}
            required
            placeholder="CI deploy"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
          Expires after
          <Select
            value={expiresInDays}
            options={[
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
              { value: '365', label: 'A year' },
              { value: '', label: 'Never' },
            ]}
            onValueChange={setExpiresInDays}
          />
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            A key that never expires is one nobody remembers to rotate.
          </span>
        </label>

        {error ? (
          <p role="alert" style={{ fontSize: '0.75rem', color: 'crimson', margin: 0 }}>
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/**
 * The only place the key is ever visible.
 *
 * Deliberately a blocking dialog rather than a toast: a toast disappears on a timer, and this
 * value cannot be retrieved a second time. Closing it is the user saying they have copied it.
 */
function RevealKeyDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={created !== null}
      onClose={onClose}
      title="Copy this key now"
      footer={<Button onClick={onClose}>I have copied it</Button>}
    >
      <p style={{ marginTop: 0 }}>
        This is the only time <strong>{created?.name}</strong> will be shown. It is stored hashed,
        so it cannot be recovered — if you lose it, revoke this key and create another.
      </p>
      <code
        style={{
          display: 'block',
          padding: '0.75rem',
          wordBreak: 'break-all',
          fontSize: '0.8125rem',
        }}
      >
        {created?.plaintext}
      </code>
    </Dialog>
  );
}

/** owner -> Owner. Roles are lowercase on the wire and sentence case on screen. */
function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
