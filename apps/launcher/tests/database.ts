import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

export async function database() {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      compatibilityDate: "2026-10-02",
      d1Databases: ["DB"],
    }),
  );
  try {
    return { runtime, db: await runtime.getD1Database("DB") };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
export async function migrate(db: Awaited<ReturnType<typeof database>>["db"]) {
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    )
    .run();
  for (const file of files) {
    if (await db.prepare("SELECT id FROM d1_migrations WHERE name = ?").bind(file).first())
      continue;
    const sql = await readFile(new URL(file, directory), "utf8");
    // Match Wrangler's SQL parser; quoted semicolons and triggers remain intact.
    const { unstable_splitSqlQuery } = await import("wrangler");
    await db.batch([
      ...unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
      db.prepare("INSERT INTO d1_migrations(name) VALUES (?)").bind(file),
    ]);
  }
  return files;
}
export async function reset(db: Awaited<ReturnType<typeof database>>["db"]) {
  await db.batch([
    db.prepare("DELETE FROM access_audit"),
    db.prepare("DELETE FROM members"),
    db.prepare("DELETE FROM access_levels WHERE id != 'member'"),
    db.prepare("DELETE FROM mutation_guard"),
    db.prepare(
      "UPDATE organization SET revision=0, owner_claimed=0, owner_email='owner@example.test' WHERE id='slice'",
    ),
  ]);
}
