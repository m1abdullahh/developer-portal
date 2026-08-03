---
to: <%= framework.sourceRoot %><%= framework.routesDir %>/sign-up.vue
---
<script setup lang="ts">
const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

async function onSubmit() {
  submitting.value = true;
  error.value = null;

  try {
    // Replace with your API call.
    throw new Error('Registration is not wired up yet — point this at your API.');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Registration failed.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="idp-auth">
    <h1 class="idp-auth__title">Create an account</h1>
    <p class="idp-auth__lede">Get started with <%= spec.meta.projectName %>.</p>

    <UiCard>
      <UiCardContent>
        <form class="idp-auth__form" @submit.prevent="onSubmit">
          <label class="idp-auth__field">
            Email
            <UiInput v-model="email" type="email" name="email" autocomplete="email" required />
          </label>

          <label class="idp-auth__field">
            Password
            <!-- new-password asks the password manager to generate one. minlength is a hint, not
                 a policy: the real rule belongs on the server, where it cannot be bypassed. -->
            <UiInput
              v-model="password"
              type="password"
              name="password"
              autocomplete="new-password"
              required
            />
          </label>

          <p v-if="error" role="alert" class="idp-auth__error">{{ error }}</p>

          <UiButton type="submit" :disabled="submitting">
            {{ submitting ? 'Creating…' : 'Create account' }}
          </UiButton>
        </form>
      </UiCardContent>
    </UiCard>

    <p class="idp-auth__links">
      Already have an account? <NuxtLink to="/sign-in">Sign in</NuxtLink>
    </p>
  </main>
</template>

<style scoped>
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
