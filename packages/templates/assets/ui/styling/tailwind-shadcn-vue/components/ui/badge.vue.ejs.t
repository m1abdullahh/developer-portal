---
to: <%= framework.sourceRoot %>components/ui/badge.vue
---
<script setup lang="ts">
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: 'neutral' });

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  success: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]',
  danger: 'bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]',
  accent: 'bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]',
};
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      TONES[tone],
    ]"
  >
    <slot />
  </span>
</template>
