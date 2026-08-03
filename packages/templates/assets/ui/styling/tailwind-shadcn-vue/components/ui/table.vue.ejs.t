---
to: <%= framework.sourceRoot %>components/ui/table.vue
---
<script setup lang="ts" generic="Row">
export interface Column<R> {
  key: string;
  header: string;
  cell: (row: R) => unknown;
  align?: 'left' | 'right';
}

defineProps<{
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: string;
}>();
</script>

<template>
  <!-- The wrapper scrolls, never the page: a wide table must not make the document scroll
       sideways, which is the failure everyone notices on a phone. -->
  <div class="w-full overflow-x-auto rounded-[var(--radius)] border border-[hsl(var(--border))]">
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="[
              'border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2',
              'text-xs font-medium text-[hsl(var(--muted-foreground))]',
              column.align === 'right' ? 'text-right' : 'text-left',
            ]"
          >
            {{ column.header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td
            :colspan="columns.length"
            class="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]"
          >
            {{ empty ?? 'Nothing to show.' }}
          </td>
        </tr>
        <tr v-for="row in rows" v-else :key="rowKey(row)">
          <td
            v-for="column in columns"
            :key="column.key"
            :class="[
              'border-b border-[hsl(var(--border))] px-3 py-2',
              column.align === 'right' ? 'text-right' : 'text-left',
            ]"
          >
            {{ column.cell(row) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
