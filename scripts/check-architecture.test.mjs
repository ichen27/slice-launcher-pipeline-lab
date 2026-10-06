import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { checkArchitecture } from "./check-architecture.mjs";
function fixture(t, entries) {
  const root = mkdtempSync(join(tmpdir(), "slice-architecture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(entries)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
const manifests = {
  "apps/a/package.json": '{"name":"@slice/a"}',
  "apps/b/package.json": '{"name":"@slice/b"}',
  "packages/ui/package.json": '{"name":"@slice/ui","exports":"./src/index.ts"}',
};
test("allows app use of shared UI and type-only contracts", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/page.tsx":
      '"use client"; import {Button} from "@slice/ui"; import type {DB} from "./server";',
    "apps/a/server.ts": 'import "server-only";',
    "packages/ui/src/index.ts": "export const Button=1;",
  });
  assert.deepEqual(checkArchitecture(root), []);
});
test("rejects relative app imports and workspace app dependencies", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/package.json": '{"name":"@slice/a","dependencies":{"@slice/b":"workspace:*"}}',
    "apps/a/page.ts": 'import x from "../b/private";',
    "apps/b/private.ts": "export default 1;",
  });
  assert.equal(checkArchitecture(root).length, 2);
});
test("traces a client re-export chain into database access", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/page.tsx": '"use client"; import {db} from "./barrel";',
    "apps/a/barrel.ts": 'export {db} from "./database";',
    "apps/a/database.ts": 'import {env} from "cloudflare:workers"; export const db=env.DB;',
  });
  assert.match(checkArchitecture(root).join("\n"), /client reaches server-only/);
});
test("rejects client env access and opaque imports", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/page.tsx": '"use client"; const x=process.env.SECRET; import(x);',
  });
  assert.equal(checkArchitecture(root).length, 2);
});

test("type imports cannot reach another app and production cannot import a test harness", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/page.ts": "import type {X} from '../b/types'; import './tests/harness';",
    "apps/b/types.ts": "export type X=string;",
    "apps/a/tests/harness.ts": "export const testOnly=true;",
  });
  assert.equal(checkArchitecture(root).length, 2);
});

test("resolves app aliases before enforcing client server boundaries", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/tsconfig.json": JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
    }),
    "apps/a/page.tsx": '"use client"; import {db} from "@/private";',
    "apps/a/src/private.ts": 'import "server-only"; export const db=1;',
  });
  assert.match(checkArchitecture(root).join("\n"), /client reaches server-only/);
});
test("walks shared workspace packages from client entries", (t) => {
  const root = fixture(t, {
    ...manifests,
    "apps/a/page.tsx": '"use client"; import {db} from "@slice/ui";',
    "packages/ui/src/index.ts": 'export {db} from "./private";',
    "packages/ui/src/private.ts": 'import "server-only"; export const db=1;',
  });
  assert.match(checkArchitecture(root).join("\n"), /client reaches server-only/);
});

test("allows erased named import/export specifiers but rejects mixed value imports", (t) => {
  const common = {
    ...manifests,
    "apps/a/server.ts": 'import "server-only"; export type DB=string; export const value=1;',
  };
  const erased = fixture(t, {
    ...common,
    "apps/a/page.tsx":
      '"use client"; import {type DB} from "./server"; export {type DB as Other} from "./server";',
  });
  assert.deepEqual(checkArchitecture(erased), []);
  const mixed = fixture(t, {
    ...common,
    "apps/a/page.tsx": '"use client"; import {type DB, value} from "./server";',
  });
  assert.match(checkArchitecture(mixed).join("\n"), /client reaches server-only/);
});
