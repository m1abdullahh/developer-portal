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
  <div
    class="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
    role="status"
    aria-live="polite"
  >
    <UiToast v-for="toast in toasts" :key="toast.id" :toast="toast" @dismiss="dismiss" />
  </div>
</template>
