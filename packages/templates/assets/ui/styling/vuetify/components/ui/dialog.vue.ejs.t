---
to: <%= framework.sourceRoot %>components/ui/dialog.vue
---
<script setup lang="ts">
/**
 * Dialog, wrapping VDialog.
 *
 * The CSS Modules implementation uses the native <dialog> element, which supplies focus trapping
 * and top-layer stacking from the platform. VDialog reimplements both, and using the native
 * element inside Vuetify would sit outside its overlay stack — so a Vuetify menu opened from
 * within the dialog would render behind it. Different mechanism, same props.
 */
defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <!-- persistent is deliberately absent: clicking the scrim and pressing Escape both close, which
       is what the other implementations do via the native element's own behaviour. -->
  <v-dialog
    :model-value="open"
    max-width="32rem"
    @update:model-value="!$event && emit('close')"
  >
    <v-card variant="outlined">
      <v-card-title class="text-subtitle-2 font-weight-bold">{{ title }}</v-card-title>
      <v-divider />
      <v-card-text class="text-body-2">
        <slot />
      </v-card-text>
      <template v-if="$slots.footer">
        <v-divider />
        <v-card-actions class="justify-end">
          <slot name="footer" />
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>
