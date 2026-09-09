---
to: codegen.ts
---
import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Resolver types from the schema.
 *
 * Run by `npm run codegen`, and by `postinstall` so a fresh clone typechecks without a separate
 * step. The output is generated code under src/generated/ and is gitignored — committing it would
 * only let it drift from the schema it was derived from.
 *
 * This file lives outside `src/` so `tsc` never compiles it and `eslint src` never lints it; the
 * codegen CLI loads it with its own TypeScript loader.
 */
const config: CodegenConfig = {
  schema: './schema.graphql',
  generates: {
    // Under src/generated/ — the directory the generated eslint config ignores and Prisma also
    // writes to — because codegen output legitimately contains `any`, and linting it fails a rule
    // meant for hand-written code.
    './src/generated/graphql/types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        // Every resolver receives the per-request context built in src/graphql/context.ts.
        contextType: '../../graphql/context.js#GraphqlContext',
        // Index signatures on the resolver map are what let @graphql-tools/schema accept it.
        useIndexSignature: true,
        // `import type` for the types codegen pulls in. The runtime compiles with
        // verbatimModuleSyntax, under which a plain import of a type is a compile error (TS1484).
        useTypeImports: true,
      },
    },
  },
};

export default config;
