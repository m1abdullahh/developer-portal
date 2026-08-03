---
to: <%= framework.sourceRoot %>components/ui/select.vue
---
<script setup lang="ts">
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
    :id="id"
    :value="modelValue"
    :disabled="disabled"
    :required="required"
    :name="name"
    :aria-invalid="invalid || undefined"
    :class="[
      'w-full rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 text-sm',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      invalid ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]',
    ]"
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
