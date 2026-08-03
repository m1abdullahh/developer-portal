---
to: <%= framework.sourceRoot %><%= framework.routesDir %>/settings.vue
---
<script setup lang="ts">
import {
  ApiError,
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
} from '~/lib/settings-api';
import { PERMISSIONS, ROLES } from '~/lib/permissions';

/**
 * Settings — organisation, permission matrix, audit log and API keys.
 *
 * One page with four panels rather than four routes. The tabs are `role="tab"` buttons over a
 * single `role="tabpanel"`, which is what lets arrow-key navigation work and what a screen reader
 * announces as a tab set — a row of links would be neither.
 */
const TABS = [
  { id: 'organisation', label: 'Organisation' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'audit', label: 'Audit log' },
  { id: 'keys', label: 'API keys' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const active = ref<TabId>('organisation');
const { push } = useToasts();

// ── organisation ─────────────────────────────────────────────────────────────
const settings = ref<OrgSettings | null>(null);
const savingSettings = ref(false);

const roleOptions = ROLES.map((role) => ({
  value: role,
  label: role.charAt(0).toUpperCase() + role.slice(1),
}));

async function saveSettings() {
  if (!settings.value) return;
  savingSettings.value = true;
  try {
    settings.value = await updateSettings({
      name: settings.value.name,
      allowedEmailDomain: settings.value.allowedEmailDomain,
      defaultRole: settings.value.defaultRole,
      requireApproval: settings.value.requireApproval,
    });
    push({ message: 'Settings saved.', tone: 'success' });
  } catch (cause) {
    push({
      message: cause instanceof ApiError ? cause.message : 'Could not save settings.',
      tone: 'danger',
      duration: 0,
    });
  } finally {
    savingSettings.value = false;
  }
}

// ── permissions ──────────────────────────────────────────────────────────────
const entries = ref<PermissionEntry[]>([]);
const savingMatrix = ref(false);

function allowed(role: string, permission: string): boolean {
  return entries.value.find((e) => e.role === role && e.permission === permission)?.allowed ?? false;
}

function toggle(role: string, permission: string) {
  entries.value = entries.value.map((e) =>
    e.role === role && e.permission === permission ? { ...e, allowed: !e.allowed } : e,
  );
}

async function saveMatrix() {
  savingMatrix.value = true;
  try {
    entries.value = await savePermissions(entries.value);
    push({ message: 'Permissions updated.', tone: 'success' });
  } catch (cause) {
    // The API refuses a change that would leave nobody able to manage settings. That refusal is
    // the point of the endpoint, so it has to be shown rather than swallowed.
    push({
      message: cause instanceof ApiError ? cause.message : 'Could not save permissions.',
      tone: 'danger',
      duration: 0,
    });
  } finally {
    savingMatrix.value = false;
  }
}

// ── audit log ────────────────────────────────────────────────────────────────
const audit = ref<AuditEntry[]>([]);
const auditColumns = [
  {
    key: 'when',
    header: 'When',
    cell: (e: AuditEntry) => new Date(e.createdAt).toLocaleString(),
  },
  { key: 'actor', header: 'Actor', cell: (e: AuditEntry) => e.actorId },
  { key: 'action', header: 'Action', cell: (e: AuditEntry) => e.action },
  { key: 'target', header: 'Target', cell: (e: AuditEntry) => e.target ?? '—' },
];

// ── api keys ─────────────────────────────────────────────────────────────────
const keys = ref<ApiKey[]>([]);
const newKeyName = ref('');
const creating = ref(false);
const revealed = ref<CreatedApiKey | null>(null);

async function onCreateKey() {
  creating.value = true;
  try {
    const created = await createApiKey({ name: newKeyName.value });
    keys.value = [created, ...keys.value];
    // Held in a ref and shown once. The API stores only a hash, so this value cannot be recovered
    // — that is the whole security property, and the dialog says so.
    revealed.value = created;
    newKeyName.value = '';
  } catch (cause) {
    push({
      message: cause instanceof ApiError ? cause.message : 'Could not create that key.',
      tone: 'danger',
      duration: 0,
    });
  } finally {
    creating.value = false;
  }
}

async function onRevoke(key: ApiKey) {
  try {
    const updated = await revokeApiKey(key.id);
    keys.value = keys.value.map((k) => (k.id === key.id ? updated : k));
    push({ message: key.name + ' revoked.', tone: 'success' });
  } catch (cause) {
    push({
      message: cause instanceof ApiError ? cause.message : 'Could not revoke that key.',
      tone: 'danger',
      duration: 0,
    });
  }
}

const keyColumns = [
  { key: 'name', header: 'Name', cell: (k: ApiKey) => k.name },
  // The prefix, never the key. Enough to tell two keys apart in a list; useless to anyone who
  // reads it over a shoulder.
  { key: 'prefix', header: 'Prefix', cell: (k: ApiKey) => k.prefix + '…' },
  {
    key: 'used',
    header: 'Last used',
    cell: (k: ApiKey) => (k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'),
  },
];

// ── loading ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  const [s, p, a, k] = await Promise.allSettled([
    getSettings(),
    getPermissions(),
    getAuditLog(),
    getApiKeys(),
  ]);
  if (s.status === 'fulfilled') settings.value = s.value;
  if (p.status === 'fulfilled') entries.value = p.value;
  if (a.status === 'fulfilled') audit.value = a.value.data;
  if (k.status === 'fulfilled') keys.value = k.value;
});
</script>

<template>
  <main class="idp-settings">
    <h1 class="idp-settings__title">Settings</h1>

    <div class="idp-settings__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :id="'tab-' + tab.id"
        :key="tab.id"
        role="tab"
        type="button"
        :aria-selected="active === tab.id"
        :aria-controls="'panel-' + tab.id"
        :class="['idp-settings__tab', active === tab.id && 'idp-settings__tab--active']"
        @click="active = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div :id="'panel-' + active" role="tabpanel" :aria-labelledby="'tab-' + active">
      <!-- organisation -->
      <UiCard v-if="active === 'organisation'">
        <UiCardContent>
          <form v-if="settings" class="idp-settings__form" @submit.prevent="saveSettings">
            <label class="idp-settings__field">
              Organisation name
              <UiInput v-model="settings.name" required />
            </label>

            <label class="idp-settings__field">
              Allowed email domain
              <UiInput
                :model-value="settings.allowedEmailDomain ?? ''"
                placeholder="example.com"
                @update:model-value="settings.allowedEmailDomain = $event || null"
              />
              <span class="idp-settings__hint">
                Leave blank to allow any address. Restricting it does not retroactively remove
                anyone who already has an account.
              </span>
            </label>

            <label class="idp-settings__field">
              Default role for new members
              <UiSelect v-model="settings.defaultRole" :options="roleOptions" />
            </label>

            <label class="idp-settings__checkbox">
              <input v-model="settings.requireApproval" type="checkbox" />
              Require an administrator to approve new members
            </label>

            <UiButton type="submit" :disabled="savingSettings">
              {{ savingSettings ? 'Saving…' : 'Save changes' }}
            </UiButton>
          </form>
        </UiCardContent>
      </UiCard>

      <!-- permission matrix -->
      <UiCard v-else-if="active === 'permissions'">
        <UiCardHeader>
          <UiCardTitle>Permission matrix</UiCardTitle>
          <UiCardDescription>
            Overrides the compiled-in policy in <code>lib/permissions.ts</code>. A cell left at its
            default follows that file; a changed cell is stored and wins.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="idp-settings__scroll">
            <table class="idp-settings__matrix">
              <thead>
                <tr>
                  <th scope="col">Permission</th>
                  <th v-for="role in ROLES" :key="role" scope="col">{{ role }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="permission in PERMISSIONS" :key="permission">
                  <th scope="row" class="idp-settings__matrix-label">{{ permission }}</th>
                  <td v-for="role in ROLES" :key="role">
                    <input
                      type="checkbox"
                      :checked="allowed(role, permission)"
                      :aria-label="role + ' may ' + permission"
                      @change="toggle(role, permission)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <UiButton :disabled="savingMatrix" @click="saveMatrix">
            {{ savingMatrix ? 'Saving…' : 'Save matrix' }}
          </UiButton>
        </UiCardContent>
      </UiCard>

      <!-- audit log -->
      <UiCard v-else-if="active === 'audit'">
        <UiCardHeader>
          <UiCardTitle>Audit log</UiCardTitle>
          <UiCardDescription>
            Append-only. There is no endpoint that edits or deletes an entry — a log an
            administrator can rewrite is not evidence of anything.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <UiTable
            :columns="auditColumns"
            :rows="audit"
            :row-key="(e: AuditEntry) => e.id"
            empty="Nothing recorded yet."
          />
        </UiCardContent>
      </UiCard>

      <!-- api keys -->
      <UiCard v-else>
        <UiCardHeader>
          <UiCardTitle>API keys</UiCardTitle>
          <UiCardDescription>
            Only a hash is stored. A key is shown once, when it is created, and cannot be
            recovered afterwards.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <form class="idp-settings__inline" @submit.prevent="onCreateKey">
            <UiInput v-model="newKeyName" placeholder="Key name" required />
            <UiButton type="submit" :disabled="creating">
              {{ creating ? 'Creating…' : 'Create key' }}
            </UiButton>
          </form>

          <UiTable
            :columns="keyColumns"
            :rows="keys"
            :row-key="(k: ApiKey) => k.id"
            empty="No keys yet."
          />

          <ul class="idp-settings__rows">
            <li v-for="key in keys" :key="key.id" class="idp-settings__row">
              <span class="idp-settings__row-name">{{ key.name }}</span>
              <UiBadge :tone="key.revokedAt ? 'danger' : 'success'">
                {{ key.revokedAt ? 'Revoked' : 'Active' }}
              </UiBadge>
              <UiButton
                v-if="!key.revokedAt"
                variant="destructive"
                size="sm"
                @click="onRevoke(key)"
              >
                Revoke
              </UiButton>
            </li>
          </ul>
        </UiCardContent>
      </UiCard>
    </div>

    <UiDialog
      :open="revealed !== null"
      title="Copy this key now"
      @close="revealed = null"
    >
      <p class="idp-settings__hint">
        This is the only time it will be shown. The server stores a hash, so it cannot be
        retrieved — create a new key if you lose it.
      </p>
      <code class="idp-settings__secret">{{ revealed?.plaintext }}</code>

      <template #footer>
        <UiButton @click="revealed = null">Done</UiButton>
      </template>
    </UiDialog>

    <UiToastRegion />
  </main>
</template>

<style scoped>
.idp-settings {
  max-width: 60rem;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}
.idp-settings__title {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.idp-settings__tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid currentcolor;
  border-color: color-mix(in srgb, currentcolor 15%, transparent);
}
.idp-settings__tab {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  opacity: 0.6;
}
.idp-settings__tab--active {
  opacity: 1;
  box-shadow: inset 0 -2px 0 currentcolor;
}
.idp-settings__form {
  display: grid;
  gap: 1rem;
  max-width: 32rem;
}
.idp-settings__field {
  display: grid;
  gap: 0.375rem;
  font-size: 0.875rem;
}
.idp-settings__checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.idp-settings__hint {
  font-size: 0.75rem;
  opacity: 0.7;
}
.idp-settings__inline {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.idp-settings__scroll {
  overflow-x: auto;
  margin-bottom: 1rem;
}
.idp-settings__matrix {
  border-collapse: collapse;
  font-size: 0.875rem;
}
.idp-settings__matrix th,
.idp-settings__matrix td {
  padding: 0.375rem 0.75rem;
  text-align: left;
}
.idp-settings__matrix-label {
  font-weight: 400;
}
.idp-settings__rows {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.idp-settings__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.idp-settings__row-name {
  flex: 1;
  font-size: 0.875rem;
}
.idp-settings__secret {
  display: block;
  margin-top: 0.75rem;
  padding: 0.75rem;
  word-break: break-all;
  font-size: 0.8125rem;
  border: 1px solid currentcolor;
  border-color: color-mix(in srgb, currentcolor 20%, transparent);
  border-radius: 0.375rem;
}
</style>
