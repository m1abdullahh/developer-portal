---
to: <%= framework.sourceRoot %>components/ui/button.vue
---
<script setup lang="ts">
/**
 * Button — one of the eight primitives every styling system implements.
 *
 * The variant and size vocabularies are identical to the React implementations on purpose: a page
 * module ported between the two families should need its markup changed, never its intent. The
 * React trio got this wrong once — `default` against `primary`, and `size` in only one of three —
 * and a test now compares them.
 *
 * Nuxt auto-imports anything under `app/components/`, so this is `<UiButton>` in a template with
 * no import statement. That is the Vue equivalent of React's `@/components/ui/button` path.
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
  // `button`, not the HTML default of `submit`: a button inside a form that submits it by accident
  // is the single most common cause of a page reloading when someone meant to open a dialog.
  { variant: 'primary', size: 'md', type: 'button', disabled: false },
);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="[$style.button, $style[variant], $style[size]]">
    <slot />
  </button>
</template>

<style module>
/*
 * `<style module>` rather than `scoped`: doc 00 §5.2 maps React's CSS Modules onto Vue's native
 * module support, and it is the closer equivalent — class names are hashed and referenced through
 * `$style`, exactly as an imported `.module.css` is referenced through its default export.
 */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.button:disabled {
  pointer-events: none;
  opacity: 0.5;
}
.button:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.button:hover:not(:disabled) {
  opacity: 0.9;
}

.primary {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
.secondary {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.outline {
  background: transparent;
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
}
.ghost {
  background: transparent;
  color: hsl(var(--foreground));
}
.destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}

.sm {
  height: 2rem;
  padding: 0 0.75rem;
}
.md {
  height: 2.5rem;
  padding: 0 1rem;
}
.lg {
  height: 2.75rem;
  padding: 0 1.5rem;
  font-size: 1rem;
}
.icon {
  height: 2.5rem;
  width: 2.5rem;
  padding: 0;
}
</style>
