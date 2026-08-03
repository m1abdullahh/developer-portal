---
to: <%= framework.sourceRoot %>components/ui/dialog.vue
---
<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Dialog, built on the native <dialog> element.
 *
 * showModal() gives focus trapping, background inertness, Escape-to-close and top-layer stacking
 * that defeats every z-index problem — all from the platform. The Vuetify implementation uses
 * VDialog instead, because a native dialog would sit outside Vuetify's own overlay stack.
 */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

const el = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (open) => {
    const dialog = el.value;
    if (!dialog) return;

    // showModal() throws if already open and close() on a closed dialog is a silent no-op, so
    // both are guarded on the element's own state rather than only on the prop.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  },
);
</script>

<template>
  <dialog
    ref="el"
    aria-labelledby="dialog-title"
    class="w-full max-w-lg rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 text-[hsl(var(--foreground))] backdrop:bg-black/50"
    @close="emit('close')"
    @click="$event.target === el && emit('close')"
  >
    <div class="border-b border-[hsl(var(--border))] px-5 py-3">
      <h2 id="dialog-title" class="m-0 text-sm font-semibold">{{ title }}</h2>
    </div>

    <div class="px-5 py-4 text-sm">
      <slot />
    </div>

    <div
      v-if="$slots.footer"
      class="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-3"
    >
      <slot name="footer" />
    </div>
  </dialog>
</template>
