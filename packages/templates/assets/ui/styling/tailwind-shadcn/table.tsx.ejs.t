---
to: <%= framework.sourceRoot %>components/ui/table.tsx
---
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** Extracts the cell. A function rather than a key path so computed columns need no wrapper. */
  cell: (row: Row) => ReactNode;
  align?: 'left' | 'right';
}

export interface TableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  /** Stable identity per row. Index keys reorder wrongly the moment rows are sorted or filtered. */
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  className?: string;
}

export function Table<Row>({ columns, rows, rowKey, empty, className }: TableProps<Row>) {
  return (
    // The wrapper scrolls, not the page: a wide table must never make the whole document
    // scroll sideways.
    <div className={cn('w-full overflow-x-auto rounded-[var(--radius)] border', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-[hsl(var(--muted))]">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))]',
                  column.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]"
              >
                {empty ?? 'Nothing to show.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b last:border-0">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3 py-2', column.align === 'right' && 'text-right')}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
