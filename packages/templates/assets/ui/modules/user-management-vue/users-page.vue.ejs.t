---
to: <%= framework.sourceRoot %><%= framework.routesDir %>/users.vue
---
<script setup lang="ts">
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
} from '~/lib/users-api';

/**
 * User management.
 *
 * Uses only the `Ui*` primitives and `~/lib/users-api`, never a styling library directly — the
 * rule that lets this page render under all three Vue styling systems.
 */
const users = ref<User[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const search = ref('');
const roleFilter = ref<'' | UserRole>('');
const inviteOpen = ref(false);

// Only `push`. `<UiToastRegion />` calls `useToasts()` itself and owns dismissal, so also
// destructuring `dismiss` here leaves an unused binding — which this project lints as an error.
const { push } = useToasts();

const STATUS_TONES: Record<UserStatus, 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
};

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const roleOptions = USER_ROLES.map((role) => ({ value: role, label: title(role) }));
const inviteRoleOptions = roleOptions.filter((option) => option.value !== 'owner');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const page = await listUsers({
      ...(search.value ? { q: search.value } : {}),
      ...(roleFilter.value ? { role: roleFilter.value } : {}),
    });
    users.value = page.data;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load users.';
  } finally {
    loading.value = false;
  }
}

// Debounced so typing in the search box does not fire a request per keystroke. The cleanup also
// prevents an earlier, slower response from arriving after a later one and overwriting it.
let timer: ReturnType<typeof setTimeout> | undefined;
watch([search, roleFilter], () => {
  clearTimeout(timer);
  timer = setTimeout(() => void load(), 250);
});
onMounted(() => void load());
onBeforeUnmount(() => clearTimeout(timer));

async function onChangeRole(user: User, role: string) {
  // Optimistic: the row updates immediately and rolls back if the API refuses. Worth the extra
  // code because the most common refusal — demoting the last owner — is one the user needs to see
  // explained rather than silently ignored.
  const previous = users.value;
  users.value = users.value.map((u) => (u.id === user.id ? { ...u, role: role as UserRole } : u));

  try {
    await updateUser(user.id, { role: role as UserRole });
    push({ message: user.email + ' is now ' + role + '.', tone: 'success' });
  } catch (cause) {
    users.value = previous;
    push({
      message: cause instanceof ApiError ? cause.message : 'Could not change that role.',
      tone: 'danger',
      duration: 0,
    });
  }
}

async function onDelete(user: User) {
  const previous = users.value;
  users.value = users.value.filter((u) => u.id !== user.id);

  try {
    await deleteUser(user.id);
    push({ message: user.email + ' removed.', tone: 'success' });
  } catch (cause) {
    users.value = previous;
    push({
      message: cause instanceof ApiError ? cause.message : 'Could not remove that user.',
      tone: 'danger',
      duration: 0,
    });
  }
}

// ── invite dialog ────────────────────────────────────────────────────────────
const inviteEmail = ref('');
const inviteName = ref('');
const inviteRole = ref<Exclude<UserRole, 'owner'>>('editor');
const inviteError = ref<string | null>(null);
const inviting = ref(false);

async function onInvite() {
  inviting.value = true;
  inviteError.value = null;

  try {
    const created = await inviteUser({
      email: inviteEmail.value,
      ...(inviteName.value ? { name: inviteName.value } : {}),
      role: inviteRole.value,
    });
    users.value = [created, ...users.value];
    push({ message: 'Invited ' + created.email + '.', tone: 'success' });
    inviteEmail.value = '';
    inviteName.value = '';
    inviteOpen.value = false;
  } catch (cause) {
    inviteError.value =
      cause instanceof Error ? cause.message : 'Could not send that invitation.';
  } finally {
    inviting.value = false;
  }
}

const columns = [
  { key: 'user', header: 'User', cell: (u: User) => u.name ?? u.email },
  { key: 'email', header: 'Email', cell: (u: User) => u.email },
  { key: 'joined', header: 'Added', cell: (u: User) => new Date(u.createdAt).toLocaleDateString() },
];
</script>

<template>
  <main class="idp-page">
    <div class="idp-page__head">
      <div>
        <h1 class="idp-page__title">Users</h1>
        <p class="idp-page__lede">
          Who can sign in to <%= spec.meta.projectName %>, and what they may do.
        </p>
      </div>
      <UiButton @click="inviteOpen = true">Invite</UiButton>
    </div>

    <UiCard>
      <UiCardContent>
        <div class="idp-page__filters">
          <UiInput v-model="search" type="search" placeholder="Search name or email" />
          <UiSelect v-model="roleFilter" placeholder="All roles" :options="roleOptions" />
        </div>

        <p v-if="error" role="alert" class="idp-page__error">{{ error }}</p>

        <!--
          The table renders the plain columns; role and actions are rendered beneath each row
          instead of inside a cell. The primitive Table takes a `cell` returning a value, not a
          slot — keeping it that way is what lets one Table serve every styling system, including
          Vuetify's, which owns its own row rendering.
        -->
        <template v-else>
          <UiTable
            :columns="columns"
            :rows="users"
            :row-key="(u: User) => u.id"
            :empty="loading ? 'Loading…' : 'Nobody matches those filters.'"
          />

          <ul class="idp-page__rows">
            <li v-for="user in users" :key="user.id" class="idp-page__row">
              <span class="idp-page__row-email">{{ user.email }}</span>
              <UiBadge :tone="STATUS_TONES[user.status]">{{ title(user.status) }}</UiBadge>
              <UiSelect
                :model-value="user.role"
                :options="roleOptions"
                @update:model-value="(value: string) => onChangeRole(user, value)"
              />
              <UiButton variant="destructive" size="sm" @click="onDelete(user)">Remove</UiButton>
            </li>
          </ul>
        </template>
      </UiCardContent>
    </UiCard>

    <UiDialog :open="inviteOpen" title="Invite a user" @close="inviteOpen = false">
      <form class="idp-page__form" @submit.prevent="onInvite">
        <label class="idp-page__field">
          Email
          <UiInput v-model="inviteEmail" type="email" required autocomplete="off" />
        </label>

        <label class="idp-page__field">
          Name (optional)
          <UiInput v-model="inviteName" />
        </label>

        <label class="idp-page__field">
          Role
          <!-- `owner` is absent on purpose. Ownership is transferred from an existing owner, never
               handed out with an invitation — the API rejects it too. -->
          <UiSelect v-model="inviteRole" :options="inviteRoleOptions" />
        </label>

        <p v-if="inviteError" role="alert" class="idp-page__error">{{ inviteError }}</p>
      </form>

      <template #footer>
        <UiButton variant="ghost" @click="inviteOpen = false">Cancel</UiButton>
        <UiButton :disabled="inviting" @click="onInvite">
          {{ inviting ? 'Sending…' : 'Send invitation' }}
        </UiButton>
      </template>
    </UiDialog>

    <UiToastRegion />
  </main>
</template>

<style scoped>
.idp-page {
  max-width: 60rem;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}
.idp-page__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.idp-page__title {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
.idp-page__lede {
  font-size: 0.875rem;
  opacity: 0.7;
  margin-top: 0;
}
.idp-page__filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.idp-page__rows {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.idp-page__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.idp-page__row-email {
  flex: 1;
  font-size: 0.875rem;
}
.idp-page__form {
  display: grid;
  gap: 1rem;
}
.idp-page__field {
  display: grid;
  gap: 0.375rem;
  font-size: 0.875rem;
}
.idp-page__error {
  font-size: 0.875rem;
  color: crimson;
}
</style>
