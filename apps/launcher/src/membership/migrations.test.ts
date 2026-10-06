import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";
import { database, migrate } from "../../tests/database";
import { Repository } from "./repository";
import { enroll } from "./domain";
let fresh: Awaited<ReturnType<typeof database>>;
let prior: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fresh = await database();
  prior = await database();
}, 30_000);
afterAll(async () => {
  await fresh?.runtime.dispose();
  await prior?.runtime.dispose();
});
it("migrates an empty D1 database", async () => {
  const files = await migrate(fresh.db);
  const initial = await new Repository(fresh.db).load();
  expect(initial).toMatchObject({
    revision: 0,
    ownerClaimed: false,
    members: [],
    levels: [{ id: "member" }],
  });
  expect(
    (await fresh.db.prepare("SELECT name FROM d1_migrations ORDER BY name").all()).results.map(
      (row: { name: string }) => row.name,
    ),
  ).toEqual(files);
});
it("upgrades the frozen prior schema without losing existing members or audit history", async () => {
  const { db } = prior;
  const sql = await readFile(
    new URL("../../tests/fixtures/prior-membership.sql", import.meta.url),
    "utf8",
  );
  await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
  await db
    .prepare(
      "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    )
    .run();
  await db.prepare("INSERT INTO d1_migrations(name) VALUES ('0001_membership.sql')").run();
  const repo = new Repository(db);
  const initial = await repo.load();
  const enrolled = enroll(
    initial,
    { email: "prior@example.test", subject: "prior-verified-subject" },
    { id: "prior-member", now: "2026-10-04T12:00:00Z" },
  );
  if (!enrolled.audit) throw new Error("Expected enrollment audit");
  await repo.commit(initial, { ...enrolled, audit: enrolled.audit });
  const before = await repo.load();
  const audit = await repo.history();
  const files = await migrate(db);
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual(audit);
  await migrate(db);
  expect(
    (await db.prepare("SELECT name FROM d1_migrations ORDER BY name").all()).results.map(
      (row: { name: string }) => row.name,
    ),
  ).toEqual(files);
});
