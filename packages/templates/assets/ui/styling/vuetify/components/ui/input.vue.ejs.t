---
to: <%= framework.sourceRoot %>components/ui/input.vue
---
<script setup lang="ts">
defineProps<{
  modelValue?: string;
  type?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  autocomplete?: string;
  name?: string;
  id?: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <!--
    hide-details because the primitive API has no error-message slot: pages render their own
    validation text. Without it VTextField reserves a fixed strip below every field for a message
    that never arrives, and a form of six inputs grows by an entire row of whitespace.
  -->
  <v-text-field
    :id="id"
    :model-value="modelValue"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    :error="invalid"
    :name="name"
    :autocomplete="autocomplete"
    density="compact"
    variant="outlined"
    hide-details
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
</template>
