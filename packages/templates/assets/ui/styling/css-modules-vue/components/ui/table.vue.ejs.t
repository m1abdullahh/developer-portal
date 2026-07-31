---
to: <%= framework.sourceRoot %>components/ui/table.vue
---
<script setup lang="ts" generic="Row">
/**
 * Table.
 *
 * `generic="Row"` is Vue's equivalent of React's `<Row,>` type parameter — without it `columns`
 * and `rows` would both degrade to `any` and a mismatched cell accessor would compile.
 *
 * `rowKey` is required for the same reason React's is: index keys reorder wrongly the moment rows
 * are sorted or filtered, and the symptom is a row's contents jumping to a neighbour.
 */
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
  <!-- The wrapper scrolls, never the page: a wide table must not make the document scroll sideways. -->
  <div :class="$style.wrap">
    <table :class="$style.table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="[$style.th, column.align === 'right' && $style.right]"
          >
            {{ column.header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length" :class="$style.empty">
            {{ empty ?? 'Nothing to show.' }}
          </td>
        </tr>
        <tr v-for="row in rows" v-else :key="rowKey(row)">
          <td
            v-for="column in columns"
            :key="column.key"
            :class="[$style.td, column.align === 'right' && $style.right]"
          >
            {{ column.cell(row) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style module>
.wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.th {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-bottom: 1px solid hsl(var(--border));
}
.td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
}
.right {
  text-align: right;
}
.empty {
  padding: 1.5rem 0.75rem;
  text-align: center;
  color: hsl(var(--muted-foreground));
}
</style>
