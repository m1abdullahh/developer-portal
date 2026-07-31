---
to: <%= framework.sourceRoot %>components/ui/card-description.vue
---
<template>
  <p :class="$style.description">
    <slot />
  </p>
</template>

<style module>
.description {
  margin: 0;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}
</style>
