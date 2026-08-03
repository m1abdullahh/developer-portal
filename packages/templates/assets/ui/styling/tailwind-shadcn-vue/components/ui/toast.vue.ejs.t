---
to: <%= framework.sourceRoot %>components/ui/toast.vue
---
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import type { Toast } from '../../composables/useToasts';

const props = defineProps<{ toast: Toast }>();
const emit = defineEmits<{ dismiss: [id: string] }>();

let timer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  // duration 0 means "require an explicit dismissal" — used for errors the reader must act on.
  const duration = props.toast.duration ?? 5000;
  if (duration > 0) timer = setTimeout(() => emit('dismiss', props.toast.id), duration);
});

onBeforeUnmount(() => clearTimeout(timer));

const TONES = {
  neutral: 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
  success: 'border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)]',
  danger: 'border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.1)]',
} as const;
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm shadow-sm',
      TONES[toast.tone ?? 'neutral'],
    ]"
  >
    <span class="flex-1">{{ toast.message }}</span>
    <button
      type="button"
      class="text-[hsl(var(--muted-foreground))]"
      @click="emit('dismiss', toast.id)"
    >
      <span aria-hidden="true">&times;</span>
      <span class="sr-only">Dismiss</span>
    </button>
  </div>
</template>
