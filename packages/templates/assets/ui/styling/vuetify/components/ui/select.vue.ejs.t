---
to: <%= framework.sourceRoot %>components/ui/select.vue
---
<script setup lang="ts">
/**
 * Select — the sharpest edge in the contract, in both families.
 *
 * Vuetify's VSelect takes `items` in its own title/value shape, while the primitive API takes
 * `options` with label/value. The translation happens here, which is exactly what the wrapper
 * exists to absorb: a page written against `options` renders correctly under every styling
 * system without knowing any of this.
 *
 * The React family reached the same shape for the same reason — MUI's Select takes MenuItem
 * children and renders a div, so any API leaning on native <option> markup could not be satisfied
 * by all three implementations.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = defineProps<{
  modelValue?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();

const items = computed(() =>
  props.options.map((option) => ({
    title: option.label,
    value: option.value,
    props: { disabled: option.disabled ?? false },
  })),
);
</script>

<template>
  <v-select
    :id="id"
    :model-value="modelValue"
    :items="items"
    :placeholder="placeholder"
    :disabled="disabled"
    :error="invalid"
    :name="name"
    density="compact"
    variant="outlined"
    hide-details
    @update:model-value="$emit('update:modelValue', $event ?? '')"
  />
</template>
