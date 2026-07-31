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
  // `duration: 0` means "require an explicit dismissal" — used for errors the reader must act on,
  // which should not vanish while they are still reading.
  const duration = props.toast.duration ?? 5000;
  if (duration > 0) timer = setTimeout(() => emit('dismiss', props.toast.id), duration);
});

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div :class="[$style.toast, $style[toast.tone ?? 'neutral']]">
    <span :class="$style.message">{{ toast.message }}</span>
    <button type="button" :class="$style.dismiss" @click="emit('dismiss', toast.id)">
      <span aria-hidden="true">&times;</span>
      <span :class="$style.sr">Dismiss</span>
    </button>
  </div>
</template>

<style module>
.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
.neutral {
  border-color: hsl(var(--border));
}
.success {
  border-color: hsl(var(--success) / 0.4);
  background: hsl(var(--success) / 0.1);
}
.danger {
  border-color: hsl(var(--destructive) / 0.4);
  background: hsl(var(--destructive) / 0.1);
}
.message {
  flex: 1;
}
.dismiss {
  border: 0;
  background: none;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
