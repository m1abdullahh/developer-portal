---
to: <%= framework.sourceRoot %><%= framework.routesDir %>/sign-in.vue
---
<script setup lang="ts">
/**
 * Sign-in.
 *
 * Uses only the `Ui*` primitives, never Vuetify or a stylesheet directly. That single rule is what
 * lets this page render under all three Vue styling systems without a per-system copy, and it is
 * worth preserving as you edit.
 *
 * The submit handler is deliberately a stub. Authentication belongs to your API, and guessing at
 * its shape here would produce code that looks finished and does nothing.
 */
const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

async function onSubmit() {
  submitting.value = true;
  error.value = null;

  try {
    // Replace with your API call. A 401 should set an error rather than throw.
    throw new Error('Sign-in is not wired up yet — point this at your API.');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Sign-in failed.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="idp-auth">
    <h1 class="idp-auth__title">Sign in</h1>
    <p class="idp-auth__lede">Welcome back to <%= spec.meta.projectName %>.</p>

    <UiCard>
      <UiCardContent>
        <form class="idp-auth__form" @submit.prevent="onSubmit">
          <label class="idp-auth__field">
            Email
            <UiInput v-model="email" type="email" name="email" autocomplete="email" required />
          </label>

          <label class="idp-auth__field">
            Password
            <!-- current-password, not new-password: it tells a password manager to offer the
                 saved credential rather than to generate a replacement. -->
            <UiInput
              v-model="password"
              type="password"
              name="password"
              autocomplete="current-password"
              required
            />
          </label>

          <p v-if="error" role="alert" class="idp-auth__error">{{ error }}</p>

          <UiButton type="submit" :disabled="submitting">
            {{ submitting ? 'Signing in…' : 'Sign in' }}
          </UiButton>
        </form>
      </UiCardContent>
    </UiCard>

    <p class="idp-auth__links">
      <NuxtLink to="/forgot-password">Forgot your password?</NuxtLink> ·
      <NuxtLink to="/sign-up">Create an account</NuxtLink>
    </p>
  </main>
</template>

<style scoped>
/* Layout only. Every colour comes from the primitives, so this file needs no design tokens and
   stays correct under whichever styling system generated them. */
.idp-auth {
  max-width: 25rem;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}
.idp-auth__title {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
.idp-auth__lede {
  font-size: 0.875rem;
  opacity: 0.7;
  margin-top: 0;
}
.idp-auth__form {
  display: grid;
  gap: 1rem;
}
.idp-auth__field {
  display: grid;
  gap: 0.375rem;
  font-size: 0.875rem;
}
.idp-auth__error {
  font-size: 0.75rem;
  color: crimson;
  margin: 0;
}
.idp-auth__links {
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
