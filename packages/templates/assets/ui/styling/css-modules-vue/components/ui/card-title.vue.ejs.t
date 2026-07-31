---
to: <%= framework.sourceRoot %>components/ui/card-title.vue
---
<template>
  <h3 :class="$style.title">
    <slot />
  </h3>
</template>

<style module>
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
}
</style>
