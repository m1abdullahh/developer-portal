---
to: <%= framework.sourceRoot %>components/ui/card-content.vue
---
<template>
  <div :class="$style.content">
    <slot />
  </div>
</template>

<style module>
.content {
  padding: 1.25rem;
}
</style>
