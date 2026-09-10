---
to: scripts/trpc-types.mjs
---
/**
 * Second half of `npm run trpc:types`: copies the router's declarations to where the client
 * compiles against them.
 *
 * `tsc -p tsconfig.trpc.json` has just emitted declarations for the router and everything it
 * imports into .trpc-types/. Only the router's TYPE matters to a client, and that type reaches
 * exactly these files: the router, the tRPC init and context beside it, and the permissions
 * policy the context's user type names. The implementations' imports — the database client and
 * its generated code — were in the program too, but declaration emit erased every use of them,
 * so their files are simply not copied.
 *
 * The target is generated, not chosen: `<%= typesTarget %>`<% if (hasClient) { %>, inside the web app, where a
 * placeholder declaring `AppRouter` as `AnyRouter` sat until the first run of this script<% } else { %>, inside this
 * package, as the artefact a client in another repository copies<% } %>.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const emitted = '.trpc-types';
const target = <%- h.json(typesTarget) %>;

if (!existsSync(path.join(emitted, 'trpc', 'router.d.ts'))) {
  console.error(`No declarations in ${emitted}/ — did tsc -p tsconfig.trpc.json fail?`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(path.join(target, 'trpc'), { recursive: true });
cpSync(path.join(emitted, 'trpc'), path.join(target, 'trpc'), { recursive: true });

const permissions = path.join(emitted, 'lib', 'permissions.d.ts');
if (existsSync(permissions)) {
  mkdirSync(path.join(target, 'lib'), { recursive: true });
  cpSync(permissions, path.join(target, 'lib', 'permissions.d.ts'));
}

rmSync(emitted, { recursive: true, force: true });
console.log(`tRPC router declarations written to ${target}/`);
