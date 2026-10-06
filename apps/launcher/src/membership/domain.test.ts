import { describe, expect, it } from "vitest";
import { applyCommand, effectivePermissions, enroll, emptyState, memberView } from "./domain";

const ownerIdentity = { subject: "owner-sub", email: "owner@example.test" };
const person = { subject: "person-sub", email: "person@example.test" };
const meta = { id: "event-1", now: "2026-10-04T12:00:00Z" };
function setup() {
  const state = emptyState(ownerIdentity.email);
  return enroll(state, ownerIdentity, meta).state;
}
function run(state: ReturnType<typeof setup>, command: unknown, actor = "owner-sub") {
  return applyCommand(state, actor, command, { ...meta, id: crypto.randomUUID() }).state;
}
describe("membership authorization", () => {
  it("never makes an unknown first visitor owner; pending users see only themselves", () => {
    const result = enroll(emptyState(ownerIdentity.email), person, meta);
    expect(result.state.members[0]).toMatchObject({ status: "pending", owner: false });
    expect(memberView(result.state, person.subject).members).toEqual([]);
    expect(() =>
      run(
        result.state,
        { type: "level.save", name: "Admin", permissions: ["members.manage"] },
        person.subject,
      ),
    ).toThrow();
  });
  it("binds an invitation only to the verified email and does not duplicate sign-ins", () => {
    let s = run(setup(), {
      type: "member.add",
      email: person.email.toUpperCase(),
      name: "Person",
      levelId: "member",
    });
    const invitedId = s.members.find((m) => m.email === person.email)!.id;
    s = enroll(s, person, { ...meta, id: crypto.randomUUID() }).state;
    expect(s.members.find((m) => m.id === invitedId)).toMatchObject({
      subject: person.subject,
      status: "active",
    });
    expect(enroll(s, person, { ...meta, id: crypto.randomUUID() }).state.members).toHaveLength(2);
    expect(() => enroll(s, { ...person, subject: "different-sub" }, meta)).toThrow();
  });
  it("supports custom levels and individual deny overrides", () => {
    let s = setup();
    s = run(s, { type: "level.save", name: "Directory reader", permissions: ["members.read"] });
    const role = s.levels.find((r) => r.name === "Directory reader")!;
    s = enroll(s, person, { ...meta, id: crypto.randomUUID() }).state;
    const id = s.members.find((m) => m.subject === person.subject)!.id;
    s = run(s, {
      type: "member.update",
      id,
      status: "active",
      levelId: role.id,
      allow: [],
      deny: ["members.read"],
      owner: false,
    });
    expect(
      effectivePermissions(
        s,
        s.members.find((m) => m.id === id)!,
      ),
    ).toEqual([]);
    expect(memberView(s, person.subject).members).toEqual([]);
  });
  it("suspension removes access immediately even for an existing identity", () => {
    let s = run(setup(), {
      type: "member.add",
      email: person.email,
      name: "Person",
      levelId: "member",
    });
    s = enroll(s, person, { ...meta, id: crypto.randomUUID() }).state;
    const target = s.members.find((m) => m.subject === person.subject)!;
    s = run(s, {
      type: "member.update",
      id: target.id,
      status: "suspended",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    });
    expect(
      effectivePermissions(
        s,
        s.members.find((m) => m.id === target.id)!,
      ),
    ).toEqual([]);
    expect(
      enroll(s, person, { ...meta, id: crypto.randomUUID() }).state.members.find(
        (m) => m.id === target.id,
      )!.status,
    ).toBe("suspended");
  });
  it("protects the last owner", () => {
    const s = setup();
    expect(() =>
      run(s, {
        type: "member.update",
        id: s.members[0].id,
        status: "suspended",
        levelId: "member",
        allow: [],
        deny: [],
        owner: false,
      }),
    ).toThrow(/owner/i);
  });
  it("rejects self escalation, delegation above authority, and own-role editing", () => {
    let s = run(setup(), {
      type: "level.save",
      name: "Limited admin",
      permissions: ["members.manage", "levels.manage", "members.read"],
    });
    const role = s.levels.find((r) => r.name === "Limited admin")!;
    s = run(s, { type: "member.add", email: person.email, name: "Person", levelId: role.id });
    s = enroll(s, person, { ...meta, id: crypto.randomUUID() }).state;
    const id = s.members.find((m) => m.subject === person.subject)!.id;
    expect(() =>
      run(s, { type: "level.save", name: "Elevated", permissions: ["audit.read"] }, person.subject),
    ).toThrow();
    expect(() =>
      run(s, { type: "level.save", id: role.id, name: role.name, permissions: [] }, person.subject),
    ).toThrow();
    expect(() =>
      run(
        s,
        {
          type: "member.update",
          id,
          status: "active",
          levelId: role.id,
          allow: [],
          deny: [],
          owner: true,
        },
        person.subject,
      ),
    ).toThrow();
  });
  it("validates commands, restricts profile fields, and audits before/after", () => {
    const s = setup();
    expect(() =>
      run(s, { type: "profile.update", name: "Name", title: "", owner: true }),
    ).toThrow();
    const updated = applyCommand(
      s,
      ownerIdentity.subject,
      { type: "profile.update", name: "New name", title: "Project manager" },
      meta,
    );
    expect(updated.state.members[0].name).toBe("New name");
    expect(updated.audit).toMatchObject({ actorId: s.members[0].id, action: "profile.update" });
    expect(updated.audit.before).not.toEqual(updated.audit.after);
  });
  it("keeps directory email and administrative fields private", () => {
    let s = run(setup(), {
      type: "member.add",
      email: person.email,
      name: "Person",
      levelId: "member",
    });
    s = enroll(s, person, { ...meta, id: crypto.randomUUID() }).state;
    const view = memberView(s, person.subject);
    expect(view.members).toHaveLength(2);
    expect(view.members[0]).not.toHaveProperty("email");
    expect(view.members[0]).not.toHaveProperty("allow");
    expect(view.levels).toEqual([]);
  });
});

describe("membership mutation rejection invariants", () => {
  it("rejects invalid profiles, duplicate names and unknown targets without changing state", () => {
    const s = setup();
    const before = structuredClone(s);
    const member = {
      type: "member.update",
      id: "missing",
      status: "active",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    };
    const cases: [unknown, number][] = [
      [{ type: "profile.update", name: "", title: "" }, 400],
      [{ type: "profile.update", name: "x".repeat(81), title: "" }, 400],
      [{ type: "profile.update", name: "Valid", title: "x".repeat(101) }, 400],
      [{ type: "profile.update", name: "Valid", title: "", email: "other@example.test" }, 400],
      [{ type: "level.save", name: "member", permissions: [] }, 409],
      [{ type: "level.save", id: "unknown", name: "New", permissions: [] }, 400],
      [{ type: "level.save", name: "New", permissions: ["unknown"] }, 400],
      [
        { type: "member.add", name: "Duplicate", email: ownerIdentity.email, levelId: "member" },
        409,
      ],
      [{ type: "member.add", name: "New", email: person.email, levelId: "unknown" }, 400],
      [member, 404],
    ];
    for (const [command, status] of cases) {
      expect(() => run(s, command)).toThrowError(expect.objectContaining({ status }));
      expect(s).toEqual(before);
    }
    expect(() =>
      run(s, { type: "profile.update", name: "Name", title: "" }, "missing-subject"),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });
  it("requires a verified identity before activation and prevents invalid status transitions", () => {
    const s = run(setup(), {
      type: "member.add",
      name: "Invited",
      email: person.email,
      levelId: "member",
    });
    const target = s.members.find((entry) => entry.email === person.email)!;
    const update = {
      type: "member.update",
      id: target.id,
      status: "active",
      levelId: "member",
      allow: [],
      deny: [],
      owner: false,
    };
    expect(() => run(s, update)).toThrow(/until this person signs in/);
    expect(() => run(s, { ...update, levelId: null })).toThrow(/Assign an access level/);
    const joined = enroll(s, person, meta).state;
    expect(() => run(joined, { ...update, status: "invited" })).toThrow(/already signed in/);
    expect(() => run(joined, { ...update, status: "pending", owner: true })).toThrow(
      /owner must be active/,
    );
    expect(() => enroll(s, { email: "invalid", subject: "person" }, meta)).toThrowError(
      expect.objectContaining({ status: 401 }),
    );
  });
  it("applies role permission removal immediately and retains deny precedence over an explicit allow", () => {
    let s = run(setup(), {
      type: "member.add",
      name: "Person",
      email: person.email,
      levelId: "member",
    });
    s = enroll(s, person, meta).state;
    expect(memberView(s, person.subject).permissions).toContain("members.read");
    s = run(s, { type: "level.save", id: "member", name: "Member", permissions: [] });
    expect(memberView(s, person.subject).members).toEqual([]);
    const target = s.members.find((entry) => entry.subject === person.subject)!;
    s = run(s, {
      type: "member.update",
      id: target.id,
      status: "active",
      levelId: "member",
      allow: ["audit.read"],
      deny: ["audit.read"],
      owner: false,
    });
    expect(memberView(s, person.subject).permissions).toEqual([]);
  });
});
