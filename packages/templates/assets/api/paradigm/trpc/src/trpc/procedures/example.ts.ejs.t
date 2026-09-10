---
to: src/trpc/procedures/example.ts
skip_if: <%= spec.api.orm !== 'prisma' %>
---
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { publicProcedure, router } from '../init.js';

/**
 * The example model from prisma/schema.prisma, exposed as a sub-router. Replace it with your
 * domain — the shape is the part worth keeping: an output schema per procedure, and rows mapped
 * to it explicitly rather than returned raw.
 */
const exampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().describe('ISO-8601'),
  updatedAt: z.string().describe('ISO-8601'),
});

type Example = z.infer<typeof exampleSchema>;

function toExample(row: { id: string; name: string; createdAt: Date; updatedAt: Date }): Example {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const exampleRouter = router({
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(exampleSchema.nullable())
    .query(async ({ input }) => {
      const row = await prisma.example.findUnique({ where: { id: input.id } });
      return row ? toExample(row) : null;
    }),

  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .output(z.array(exampleSchema))
    .query(async ({ input }) => {
      const rows = await prisma.example.findMany({
        take: input.limit,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toExample);
    }),
});
