---
to: <%= framework.sourceRoot %>components/ui/select.vue
---
<script setup lang="ts">
/**
 * Select.
 *
 * Takes `options`, not child `<option>` elements. That shape was chosen in the React family after
 * MUI proved the alternative unworkable — its Select renders a div and takes MenuItem children, so
 * any API leaning on native `<option>` markup could not be satisfied by all three systems. Vuetify
 * has the same characteristic, so the same decision holds here.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineProps<{
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
</script>

<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    :required="required"
    :name="name"
    :id="id"
    :aria-invalid="invalid || undefined"
    :class="[$style.field, invalid && $style.invalid]"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>

<style module>
.field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--background));
  color: inherit;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
}
.field:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.field:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.invalid {
  border-color: hsl(var(--destructive));
}
</style>
