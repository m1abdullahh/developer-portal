---
to: tsconfig.trpc.json
---
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "emitDeclarationOnly": true,
    "noEmit": false,
    "outDir": ".trpc-types",
    "rootDir": "src",
    "incremental": false
  },
  "include": [],
  "files": ["src/trpc/router.ts"]
}
