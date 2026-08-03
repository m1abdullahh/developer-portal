---
to: <%= framework.sourceRoot %>components/ui/badge.vue
---
<script setup lang="ts">
/**
 * Badge, wrapping VChip rather than VBadge.
 *
 * Chosen by behaviour, not by name. Vuetify's VBadge is an overlay dot pinned to another element's
 * corner — a notification count. What the primitive API calls a badge is an inline status pill,
 * which is VChip. Matching on the name would have produced a component that renders in the wrong
 * place entirely.
 */
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

const props = withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: 'neutral' });

const COLORS: Record<BadgeTone, string | undefined> = {
  neutral: undefined,
  success: 'success',
  warning: 'warning',
  danger: 'error',
  accent: 'primary',
};

const color = computed(() => COLORS[props.tone]);
</script>

<template>
  <v-chip :color="color" size="small" variant="tonal" label>
    <slot />
  </v-chip>
</template>
