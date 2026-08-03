---
to: <%= framework.sourceRoot %>components/ui/card-title.vue
---
<template>
  <!-- A plain h3, not VCardTitle: VCardTitle applies its own padding, which would double up on
       CardHeader's and put the title out of line with the description beneath it. -->
  <h3 class="text-subtitle-1 font-weight-medium ma-0">
    <slot />
  </h3>
</template>
