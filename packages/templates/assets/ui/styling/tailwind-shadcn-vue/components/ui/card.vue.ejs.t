---
to: <%= framework.sourceRoot %>components/ui/card.vue
---
<template>
  <!-- An unpadded frame. Padding belongs to CardContent, matching every other styling system. -->
  <div
    class="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
  >
    <slot />
  </div>
</template>
