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
  <input
    :id="id"
    :value="modelValue"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :autocomplete="autocomplete"
    :name="name"
    :aria-invalid="invalid || undefined"
    :class="[
      'w-full rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 text-sm',
      'placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none',
      'focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      invalid ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]',
    ]"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
