---
to: <%= framework.sourceRoot %>components/ui/dialog.vue
---
<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Dialog, built on the native <dialog> element.
 *
 * showModal() gives focus trapping, background inertness, Escape-to-close and top-layer stacking
 * that defeats every z-index problem — all from the platform. A div-based modal has to rebuild
 * each of those and usually gets focus wrong.
 */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

const el = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (open) => {
    const dialog = el.value;
    if (!dialog) return;

    // showModal() throws if the dialog is already open and close() on a closed dialog is a silent
    // no-op, so both are guarded on the element's own state rather than only on the prop.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  },
);
</script>

<template>
  <dialog
    ref="el"
    :class="$style.dialog"
    aria-labelledby="dialog-title"
    @close="emit('close')"
    @click="$event.target === el && emit('close')"
  >
    <div :class="$style.header">
      <h2 id="dialog-title" :class="$style.title">{{ title }}</h2>
    </div>

    <div :class="$style.body">
      <slot />
    </div>

    <div v-if="$slots.footer" :class="$style.footer">
      <slot name="footer" />
    </div>
  </dialog>
</template>

<style module>
.dialog {
  width: 100%;
  max-width: 32rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  padding: 0;
}
.dialog::backdrop {
  background: rgb(0 0 0 / 0.5);
}
.header {
  border-bottom: 1px solid hsl(var(--border));
  padding: 0.75rem 1.25rem;
}
.title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}
.body {
  padding: 1rem 1.25rem;
  font-size: 0.875rem;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid hsl(var(--border));
  padding: 0.75rem 1.25rem;
}
</style>
