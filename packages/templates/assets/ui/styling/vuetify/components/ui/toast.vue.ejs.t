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
  // duration 0 means "require an explicit dismissal" — used for errors the reader must act on,
  // which should not vanish while they are still reading.
  const duration = props.toast.duration ?? 5000;
  if (duration > 0) timer = setTimeout(() => emit('dismiss', props.toast.id), duration);
});

onBeforeUnmount(() => clearTimeout(timer));

const TONES = { neutral: undefined, success: 'success', danger: 'error' } as const;
</script>

<template>
  <!--
    VAlert, not VSnackbar. VSnackbar positions and stacks itself, so several at once overlap into
    an unreadable pile — the region component owns placement here, exactly as it does in the other
    implementations, and this renders only the item.
  -->
  <v-alert
    :color="TONES[toast.tone ?? 'neutral']"
    variant="tonal"
    border="start"
    density="compact"
    closable
    @click:close="emit('dismiss', toast.id)"
  >
    {{ toast.message }}
  </v-alert>
</template>
