---
to: <%= framework.sourceRoot %>components/ui/button.vue
---
<script setup lang="ts">
/**
 * Button.
 *
 * No `cn` helper, unlike the React implementation. Vue merges a `class` array natively and merges
 * whatever a parent passes on top, so `clsx` and `tailwind-merge` buy nothing here — two
 * dependencies the React version needs and this one does not.
 */
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', disabled: false },
);

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90',
  secondary: 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:opacity-90',
  outline: 'border border-[hsl(var(--border))] bg-transparent hover:bg-[hsl(var(--muted))]',
  ghost: 'bg-transparent hover:bg-[hsl(var(--muted))]',
  destructive:
    'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
  icon: 'h-10 w-10',
};
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium',
      'transition-colors focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50',
      VARIANTS[variant],
      SIZES[size],
    ]"
  >
    <slot />
  </button>
</template>
