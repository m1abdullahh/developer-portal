---
to: <%= framework.sourceRoot %>components/ui/card-header.vue
---
<template>
  <div :class="$style.header">
    <slot />
  </div>
</template>

<style module>
.header {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 1.25rem 1.25rem 0;
}
</style>
