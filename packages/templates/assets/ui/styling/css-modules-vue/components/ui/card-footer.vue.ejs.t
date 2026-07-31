---
to: <%= framework.sourceRoot %>components/ui/card-footer.vue
---
<template>
  <div :class="$style.footer">
    <slot />
  </div>
</template>

<style module>
.footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1.25rem 1.25rem;
}
</style>
