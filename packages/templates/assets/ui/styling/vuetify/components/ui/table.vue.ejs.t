---
to: <%= framework.sourceRoot %>components/ui/table.vue
---
<script setup lang="ts" generic="Row">
/**
 * Table.
 *
 * A plain VTable, not VDataTable. VDataTable owns sorting, pagination and its own headers/items
 * shape — none of which the primitive API exposes, and all of which would fight the page module's
 * own cursor pagination. VTable is the styled shell; the rows stay ours.
 *
 * generic="Row" is Vue's equivalent of React's type parameter: without it `columns` and `rows`
 * both degrade to any, and a mismatched cell accessor would compile.
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
  <v-table density="compact">
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column.key"
          :class="column.align === 'right' ? 'text-right' : 'text-left'"
        >
          {{ column.header }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="rows.length === 0">
        <td :colspan="columns.length" class="text-center text-medium-emphasis py-6">
          {{ empty ?? 'Nothing to show.' }}
        </td>
      </tr>
      <tr v-for="row in rows" v-else :key="rowKey(row)">
        <td
          v-for="column in columns"
          :key="column.key"
          :class="column.align === 'right' ? 'text-right' : 'text-left'"
        >
          {{ column.cell(row) }}
        </td>
      </tr>
    </tbody>
  </v-table>
</template>
