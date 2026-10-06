import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { Repository } from "./repository";
import { applyCommand, enroll } from "./domain";
let fixture: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  fixture = await database();
  await migrate(fixture.db);
}, 30_000);
beforeEach(async () => {
  await reset(fixture.db);
});
afterAll(async () => {
  await fixture?.runtime.dispose();
});
async function setup() {
  const { db } = fixture;
  const repo = new Repository(db);
  const initial = await repo.load();
  const first = enroll(
    initial,
    { subject: "owner", email: "owner@example.test" },
    { id: "owner-member", now: new Date().toISOString() },
  );
  if (!first.audit) throw new Error("Expected enrollment");
  await repo.commit(initial, { ...first, audit: first.audit });
  return { repo, db };
}
it("persists members and their audit record together", async () => {
  const { repo } = await setup();
  const state = await repo.load();
  expect(state.ownerClaimed).toBe(true);
  expect(state.members[0].owner).toBe(true);
  expect(await repo.history()).toHaveLength(1);
});
it("rejects stale mutations and rolls back every write and audit", async () => {
  const { repo, db } = await setup();
  const before = await repo.load();
  const first = applyCommand(
    before,
    "owner",
    { type: "level.save", name: "One", permissions: [] },
    { id: "one", now: "now" },
  );
  const second = applyCommand(
    before,
    "owner",
    { type: "level.save", name: "Two", permissions: [] },
    { id: "two", now: "now" },
  );
  await repo.commit(before, first);
  await expect(repo.commit(before, second)).rejects.toMatchObject({ status: 409 });
  expect((await repo.load()).levels.map((r) => r.name)).toEqual(["Member", "One"]);
  expect(await repo.history()).toHaveLength(2);
  expect(await db.prepare("SELECT COUNT(*) as count FROM mutation_guard").first("count")).toBe(0);
});

it("rolls back earlier writes when an audit insert fails later in the transaction", async () => {
  const { repo } = await setup();
  const before = await repo.load();
  const history = await repo.history();
  const change = applyCommand(
    before,
    "owner",
    { type: "profile.update", name: "Should roll back", title: "" },
    { id: history[0].id, now: "now" },
  );
  await expect(repo.commit(before, change)).rejects.toThrow();
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual(history);
});
