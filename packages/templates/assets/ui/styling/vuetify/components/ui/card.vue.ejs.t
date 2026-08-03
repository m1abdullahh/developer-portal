---
to: <%= framework.sourceRoot %>components/ui/card.vue
---
<template>
  <!--
    Card — an unpadded frame.

    variant="outlined" rather than Vuetify's default elevation: the other styling systems draw a
    border and a hairline shadow, and a raised card here would read as a different design language.

    It deliberately does NOT wrap its slot in VCardText. Padding belongs to CardContent, matching
    every other styling system — wrapping here would give a page composing CardHeader and
    CardContent two layers of padding and a header nested inside a content region.
  -->
  <v-card variant="outlined">
    <slot />
  </v-card>
</template>
