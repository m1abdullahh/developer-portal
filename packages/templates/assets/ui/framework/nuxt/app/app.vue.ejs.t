---
to: app/app.vue
---
<template>
  <!--
    The application shell.

    `NuxtLayout` wraps every page in whichever layout it names, and `NuxtPage` renders the matched
    route. Anything that must appear on every screen — a nav bar, a toast region — goes here,
    outside `NuxtPage`, so it survives navigation instead of remounting.

    There is no provider tree. A Vue project installs stores and clients as Nuxt modules and
    plugins, so nothing wraps this file the way a React root layout gets wrapped.
  -->
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
