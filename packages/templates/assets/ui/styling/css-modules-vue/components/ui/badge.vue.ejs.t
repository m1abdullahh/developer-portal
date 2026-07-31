---
to: <%= framework.sourceRoot %>components/ui/badge.vue
---
<script setup lang="ts">
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: 'neutral' });
</script>

<template>
  <span :class="[$style.badge, $style[tone]]">
    <slot />
  </span>
</template>

<style module>
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
}
.neutral {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.success {
  background: hsl(var(--success) / 0.15);
  color: hsl(var(--success));
}
.warning {
  background: hsl(var(--warning) / 0.15);
  color: hsl(var(--warning));
}
.danger {
  background: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}
.accent {
  background: hsl(var(--accent) / 0.15);
  color: hsl(var(--accent));
}
</style>
