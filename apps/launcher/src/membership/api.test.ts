import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { database, migrate, reset } from "../../tests/database";
import { Repository } from "./repository";
import { membershipRequest, errorResponse } from "./api";
import type { View, Member } from "./contracts";
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
it("runs onboarding, approval, privacy checks and revocation against D1", async () => {
  const { db } = fixture;
  const repo = new Repository(db);
  const owner = { subject: "owner", email: "owner@example.test" };
  const person = { subject: "person", email: "person@example.test" };
  const call = async (identity: typeof owner, body?: unknown, query = "") => {
    const req = new Request(
      `https://slice.example/api/membership${query}`,
      body
        ? {
            method: "POST",
            headers: { origin: "https://slice.example", "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    try {
      return await membershipRequest(req, identity, repo);
    } catch (e) {
      return errorResponse(e);
    }
  };
  expect(await (await call(person)).json()).toEqual({ needsEnrollment: true });
  let pending = (await (await call(person, { command: { type: "join" } })).json()) as View;
  expect(pending.me.status).toBe("pending");
  expect(pending.members).toEqual([]);
  expect((await call(person, undefined, "?view=history")).status).toBe(403);
  expect(
    (
      await call(person, {
        revision: pending.revision,
        command: {
          type: "member.add",
          name: "Other",
          email: "other@example.test",
          levelId: "member",
        },
      })
    ).status,
  ).toBe(403);
  const admin = (await (await call(owner, { command: { type: "join" } })).json()) as View;
  const approve = {
    type: "member.update",
    id: pending.me.id,
    status: "active",
    levelId: "member",
    owner: false,
    allow: [],
    deny: [],
  };
  expect((await call(owner, { revision: pending.revision, command: approve })).status).toBe(409);
  let current = (await (
    await call(owner, { revision: admin.revision, command: approve })
  ).json()) as View;
  pending = (await (await call(person)).json()) as View;
  expect(pending.me.status).toBe("active");
  expect(pending.members[0]).not.toHaveProperty("email");
  current = (await (
    await call(owner, { revision: current.revision, command: { ...approve, status: "suspended" } })
  ).json()) as View;
  expect((current.members.find((m) => m.id === pending.me.id) as Member).status).toBe("suspended");
  expect(((await (await call(person)).json()) as View).permissions).toEqual([]);
  expect(
    (
      await call(person, {
        revision: current.revision,
        command: { type: "profile.update", name: "Changed", title: "" },
      })
    ).status,
  ).toBe(403);
  expect(await (await call({ ...person, email: "other@example.test" })).json()).toHaveProperty(
    "error",
  );
});

it("rejects invalid envelopes and unrecognized methods without mutating D1", async () => {
  const repo = new Repository(fixture.db);
  const before = await repo.load();
  const identity = { subject: "unknown", email: "unknown@example.test" };
  const invoke = async (method: string, body?: unknown) => {
    const request = new Request("https://slice.example/api/membership", {
      method,
      headers: { origin: "https://slice.example", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try {
      return await membershipRequest(request, identity, repo);
    } catch (error) {
      return errorResponse(error);
    }
  };
  expect((await invoke("DELETE")).status).toBe(405);
  for (const body of [
    { command: { type: "join" }, privilege: "owner" },
    { revision: -1, command: { type: "join" } },
    [],
  ]) {
    expect((await invoke("POST", body)).status).toBe(400);
  }
  expect(
    (
      await invoke("POST", {
        revision: 0,
        command: { type: "profile.update", name: "Unauthorized", title: "" },
      })
    ).status,
  ).toBe(403);
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual([]);
});
it("keeps duplicate enrollment idempotent and protects invitations from another identity", async () => {
  const repo = new Repository(fixture.db);
  const owner = { subject: "owner", email: "owner@example.test" };
  const member = { subject: "invited", email: "invited@example.test" };
  const call = async (identity: typeof owner, command: unknown) => {
    const { revision } = await repo.load();
    const request = new Request("https://slice.example/api/membership", {
      method: "POST",
      headers: { origin: "https://slice.example", "content-type": "application/json" },
      body: JSON.stringify({ revision, command }),
    });
    try {
      return await membershipRequest(request, identity, repo);
    } catch (error) {
      return errorResponse(error);
    }
  };
  await call(owner, { type: "join" });
  await call(owner, {
    type: "member.add",
    email: member.email,
    name: "Invited",
    levelId: "member",
  });
  await call({ subject: "other", email: "other@example.test" }, { type: "join" });
  expect(
    (await repo.load()).members.find((entry) => entry.email === member.email)?.subject,
  ).toBeNull();
  const joined = await call(member, { type: "join" });
  expect(((await joined.json()) as View).me.status).toBe("active");
  const before = await repo.load();
  const history = await repo.history();
  expect((await call(member, { type: "join" })).status).toBe(200);
  expect(await repo.load()).toEqual(before);
  expect(await repo.history()).toEqual(history);
  expect((await call({ ...member, subject: "forged-identity" }, { type: "join" })).status).toBe(
    403,
  );
  expect(
    (await call({ ...member, email: "different@example.test" }, { type: "join" })).status,
  ).toBe(403);
  expect(await repo.load()).toEqual(before);
});
