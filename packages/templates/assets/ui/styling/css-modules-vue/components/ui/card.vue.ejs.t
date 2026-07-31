---
to: <%= framework.sourceRoot %>components/ui/card.vue
---
<template>
  <!--
    Card — an unpadded frame.

    Padding belongs to CardContent, matching every other styling system. That split was once
    inconsistent in the React trio: Tailwind's Card had no padding while CSS Modules' and MUI's
    did, so identical markup rendered differently depending on the design system. The API matched;
    the output did not.

    Vue has one component per file, so the six pieces React exports from card.tsx are six files
    here. Nuxt auto-imports them as UiCard, UiCardHeader and so on.
  -->
  <div :class="$style.card">
    <slot />
  </div>
</template>

<style module>
.card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
</style>
