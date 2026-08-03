---
to: <%= framework.sourceRoot %><%= framework.routesDir %>/forgot-password.vue
---
<script setup lang="ts">
const email = ref('');
const sent = ref(false);
const submitting = ref(false);

async function onSubmit() {
  submitting.value = true;

  try {
    // Replace with your API call.
  } finally {
    submitting.value = false;

    /*
     * Reports success even for an address with no account, and deliberately so.
     *
     * Saying "no such user" turns this form into an account-enumeration oracle: anyone can
     * discover which addresses are registered by submitting them one at a time. The generic
     * message costs a real user nothing — they check their inbox either way.
     */
    sent.value = true;
  }
}
</script>

<template>
  <main class="idp-auth">
    <h1 class="idp-auth__title">Reset your password</h1>

    <template v-if="sent">
      <p class="idp-auth__lede">
        If an account exists for that address, a reset link is on its way.
      </p>

      <UiCard>
        <UiCardContent>
          <p class="idp-auth__note">
            The link expires shortly. Check your spam folder if it does not arrive.
          </p>
        </UiCardContent>
      </UiCard>
    </template>

    <template v-else>
      <p class="idp-auth__lede">We will email you a link to choose a new one.</p>

      <UiCard>
        <UiCardContent>
          <form class="idp-auth__form" @submit.prevent="onSubmit">
            <label class="idp-auth__field">
              Email
              <UiInput v-model="email" type="email" name="email" autocomplete="email" required />
            </label>

            <UiButton type="submit" :disabled="submitting">
              {{ submitting ? 'Sending…' : 'Send reset link' }}
            </UiButton>
          </form>
        </UiCardContent>
      </UiCard>
    </template>

    <p class="idp-auth__links">
      <NuxtLink to="/sign-in">Back to sign in</NuxtLink>
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
.idp-auth__note {
  font-size: 0.875rem;
  margin: 0;
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
.idp-auth__links {
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>
