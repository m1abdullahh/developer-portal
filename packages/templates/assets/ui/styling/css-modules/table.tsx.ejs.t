---
to: <%= framework.sourceRoot %>components/ui/table.tsx
---
import type { ReactNode } from 'react';
import styles from './ui.module.css';

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
  const cellClass = (align: Column<Row>['align']) =>
    [styles.td, align === 'right' && styles.right].filter(Boolean).join(' ');

  return (
    <div className={[styles.tableWrap, className].filter(Boolean).join(' ')}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[styles.th, column.align === 'right' && styles.right]
                  .filter(Boolean)
                  .join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty ?? 'Nothing to show.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={cellClass(column.align)}>
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
