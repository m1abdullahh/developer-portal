---
to: <%= framework.sourceRoot %>components/ui/button.vue
---
<script setup lang="ts">
/**
 * Button, wrapping Vuetify's VBtn.
 *
 * Vuetify has its own `variant` prop with entirely different values — flat, outlined, text,
 * elevated, tonal, plain. Ours wins and Vuetify's is mapped, never exposed: a component whose
 * props change meaning depending on the styling option would defeat the whole point of a shared
 * primitive API. The escape hatch is to use <v-btn> directly, which is always available.
 */
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', disabled: false },
);

const VARIANTS: Record<ButtonVariant, { variant: 'flat' | 'outlined' | 'text'; color?: string }> = {
  primary: { variant: 'flat', color: 'primary' },
  secondary: { variant: 'flat' },
  outline: { variant: 'outlined' },
  ghost: { variant: 'text' },
  destructive: { variant: 'flat', color: 'error' },
};

// Vuetify has no 'md' — 'default' is its middle size. 'icon' maps to small and is squared off by
// VBtn's own icon flag below.
const SIZES: Record<ButtonSize, string> = {
  sm: 'small',
  md: 'default',
  lg: 'large',
  icon: 'small',
};

const mapped = computed(() => VARIANTS[props.variant]);
</script>

<template>
  <v-btn
    :type="type"
    :disabled="disabled"
    :variant="mapped.variant"
    :color="mapped.color"
    :size="SIZES[size]"
    :icon="size === 'icon'"
  >
    <slot />
  </v-btn>
</template>
