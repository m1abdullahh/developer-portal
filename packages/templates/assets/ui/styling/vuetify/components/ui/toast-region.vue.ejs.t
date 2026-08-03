---
to: <%= framework.sourceRoot %>components/ui/toast-region.vue
---
<script setup lang="ts">
const { toasts, dismiss } = useToasts();
</script>

<template>
  <!--
    polite, not assertive: a toast should be announced at the next natural pause rather than
    interrupting whatever a screen reader is currently saying.

    Render this once, in app.vue outside NuxtPage, so a toast fired during navigation survives it.
  -->
  <div class="idp-toast-region" role="status" aria-live="polite">
    <UiToast v-for="toast in toasts" :key="toast.id" :toast="toast" @dismiss="dismiss" />
  </div>
</template>

<style scoped>
.idp-toast-region {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 2500;
  display: flex;
  width: 20rem;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
