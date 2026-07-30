---
to: <%= framework.sourceRoot %>components/ui/table.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import MuiTable from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import type { ReactNode } from 'react';

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
    // TableContainer on an outlined Paper gives the same bordered, horizontally scrolling frame
    // the other two styling systems build by hand.
    <TableContainer component={Paper} variant="outlined" {...(className ? { className } : {})}>
      <MuiTable size="small">
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} align={column.align ?? 'left'}>
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} align="center">
                {empty ?? 'Nothing to show.'}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)} hover>
                {columns.map((column) => (
                  <TableCell key={column.key} align={column.align ?? 'left'}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </MuiTable>
    </TableContainer>
  );
}
