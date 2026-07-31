---
to: <%= framework.sourceRoot %>components/ui/input.vue
---
<script setup lang="ts">
/**
 * Input.
 *
 * `modelValue` + `update:modelValue` is Vue's v-model contract, so a page writes
 * `<UiInput v-model="email" />`. React's equivalent primitive takes `value` and `onChange`; the
 * shapes differ because the frameworks differ, which is precisely why the primitive API is shared
 * within a family rather than across families.
 */
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
  <input
    :value="modelValue"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :autocomplete="autocomplete"
    :name="name"
    :id="id"
    :aria-invalid="invalid || undefined"
    :class="[$style.field, invalid && $style.invalid]"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
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
.field::placeholder {
  color: hsl(var(--muted-foreground));
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
