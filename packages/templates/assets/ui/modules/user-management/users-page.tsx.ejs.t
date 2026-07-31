---
to: <%= framework.routing === 'file-based' ? framework.sourceRoot + 'app/users/page.tsx' : framework.sourceRoot + 'pages/Users.tsx' %>
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, type Column } from '@/components/ui/table';
import { ToastRegion, useToasts } from '@/components/ui/toast';
import {
  ApiError,
  USER_ROLES,
  deleteUser,
  inviteUser,
  listUsers,
  updateUser,
  type User,
  type UserRole,
  type UserStatus,
} from '@/lib/users-api';

/**
 * User management.
 *
 * Imports only from `@/components/ui/*` and `@/lib/users-api` — never from Tailwind, MUI or a
 * stylesheet directly. That single rule is what lets this page render under all three styling
 * systems with no per-system copy, and it is worth preserving as you edit.
 *
 * Data loading uses an effect and local state rather than a data library, because this module
 * ships to projects using four different ones. If yours uses TanStack Query, the functions in
 * `users-api.ts` are already the right shape for `useQuery` and `useMutation`.
 */

const STATUS_TONES: Record<UserStatus, 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | UserRole>('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listUsers({
        ...(search ? { q: search } : {}),
        ...(roleFilter ? { role: roleFilter } : {}),
      });
      setUsers(page.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per keystroke. The cleanup
    // cancels the pending timer, which is also what prevents an earlier, slower response from
    // arriving after a later one and overwriting it.
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function onChangeRole(user: User, role: UserRole) {
    // Optimistic: the row updates immediately and rolls back if the API refuses. Worth the extra
    // code here because the most common refusal — demoting the last owner — is one the user needs
    // to see explained, not silently ignored.
    const previous = users;
    setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, role } : u)));

    try {
      await updateUser(user.id, { role });
      push({ message: `${user.email} is now ${role.toLowerCase()}.`, tone: 'success' });
    } catch (cause) {
      setUsers(previous);
      push({
        message: cause instanceof ApiError ? cause.message : 'Could not change that role.',
        tone: 'danger',
        // Left until dismissed. A refusal the user must act on should not vanish while they
        // are still reading it.
        duration: 0,
      });
    }
  }

  async function onDelete(user: User) {
    const previous = users;
    setUsers((current) => current.filter((u) => u.id !== user.id));

    try {
      await deleteUser(user.id);
      push({ message: `${user.email} removed.`, tone: 'success' });
    } catch (cause) {
      setUsers(previous);
      push({
        message: cause instanceof ApiError ? cause.message : 'Could not remove that user.',
        tone: 'danger',
        duration: 0,
      });
    }
  }

  const columns: Column<User>[] = [
    {
      key: 'user',
      header: 'User',
      cell: (user) => (
        <div>
          <div>{user.name ?? '—'}</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{user.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (user) => (
        <Select
          value={user.role}
          options={USER_ROLES.map((role) => ({ value: role, label: title(role) }))}
          onValueChange={(value) => void onChangeRole(user, value as UserRole)}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (user) => <Badge tone={STATUS_TONES[user.status]}>{title(user.status)}</Badge>,
    },
    {
      key: 'joined',
      header: 'Added',
      cell: (user) => new Date(user.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (user) => (
        <Button variant="destructive" size="sm" onClick={() => void onDelete(user)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Users</h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: 0 }}>
            Who can sign in to <%= spec.meta.projectName %>, and what they may do.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invite</Button>
      </div>

      <Card className="mt-6">
        <CardContent>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <Input
              type="search"
              placeholder="Search name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={roleFilter}
              placeholder="All roles"
              options={USER_ROLES.map((role) => ({ value: role, label: title(role) }))}
              onValueChange={(value) => setRoleFilter(value as '' | UserRole)}
            />
          </div>

          {error ? (
            <p role="alert" style={{ fontSize: '0.875rem', color: 'crimson' }}>
              {error}
            </p>
          ) : (
            <Table
              columns={columns}
              rows={users}
              rowKey={(user) => user.id}
              empty={loading ? 'Loading…' : 'Nobody matches those filters.'}
            />
          )}
        </CardContent>
      </Card>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(user) => {
          setUsers((current) => [user, ...current]);
          push({ message: `Invited ${user.email}.`, tone: 'success' });
          setInviteOpen(false);
        }}
      />

      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (user: User) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Exclude<UserRole, 'owner'>>('editor');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      onInvited(await inviteUser({ email, ...(name ? { name } : {}), role }));
      setEmail('');
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send that invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite a user"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-user" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </>
      }
    >
      {/* `id` + `form` on the footer button: the buttons live outside the form element, and this
          is what still submits it. */}
      <form id="invite-user" onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
          Email
          <Input
            type="email"
            value={email}
            required
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
          Name (optional)
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem' }}>
          Role
          <Select
            value={role}
            // `owner` is absent on purpose. Ownership is transferred from an existing owner, never
            // handed out with an invitation — the API rejects it too.
            options={USER_ROLES.filter((r) => r !== 'owner').map((r) => ({
              value: r,
              label: title(r),
            }))}
            onValueChange={(value) => setRole(value as Exclude<UserRole, 'owner'>)}
          />
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

/** owner -> Owner. Roles are lowercase on the wire and sentence case on screen. */
function title(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
