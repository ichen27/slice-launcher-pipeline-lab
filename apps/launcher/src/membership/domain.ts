import { commandSchema, emailSchema, MembershipError, permissionCatalog } from "./contracts";
import type { Identity, Member, Meta, Mutation, State, View } from "./contracts";
export { MembershipError } from "./contracts";

function fail(status: number, message: string): never {
  throw new MembershipError(status, message);
}
export function emptyState(ownerEmail: string | null): State {
  return {
    revision: 0,
    ownerEmail,
    ownerClaimed: false,
    members: [],
    levels: [{ id: "member", name: "Member", permissions: ["members.read"] }],
  };
}
export function effectivePermissions(state: State, member: Member): string[] {
  if (member.status !== "active") return [];
  if (member.owner) return permissionCatalog.map((p) => p.id).sort();
  const base = state.levels.find((level) => level.id === member.levelId)?.permissions ?? [];
  return [...new Set([...base, ...member.allow])]
    .filter((p) => !member.deny.includes(p) && permissionCatalog.some((item) => item.id === p))
    .sort();
}
function subjectMember(state: State, subject: string): Member {
  return state.members.find((m) => m.subject === subject) ?? fail(403, "Membership not found.");
}
function finish(
  state: State,
  meta: Meta,
  actorId: string,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
): Mutation {
  state.revision += 1;
  return { state, audit: { id: meta.id, at: meta.now, actorId, action, targetId, before, after } };
}
export function enroll(
  original: State,
  identity: Identity,
  meta: Meta,
): Mutation | { state: State; audit: null } {
  const state = structuredClone(original);
  const parsed = emailSchema.safeParse(identity.email);
  if (!parsed.success || !identity.subject) fail(401, "Verified identity is required.");
  const email = parsed.data;
  const bound = state.members.find((m) => m.subject === identity.subject);
  if (bound) {
    if (bound.email !== email) fail(403, "Your sign-in email changed. Contact an administrator.");
    return { state: original, audit: null };
  }
  const invited = state.members.find((m) => m.email === email);
  if (invited?.subject)
    fail(403, "This email is already linked to a different identity. Contact an administrator.");
  const before = invited ? structuredClone(invited) : null;
  const member: Member = invited ?? {
    id: meta.id,
    subject: null,
    email,
    name: "",
    title: "",
    status: "pending",
    levelId: null,
    allow: [],
    deny: [],
    owner: false,
    joinedAt: meta.now,
  };
  member.subject = identity.subject;
  if (member.status === "invited") member.status = "active";
  // Owner email is configured by an operator and consumed once, never derived from first visit.
  if (!state.ownerClaimed && state.ownerEmail && email === state.ownerEmail.toLowerCase()) {
    member.owner = true;
    member.status = "active";
    member.levelId = "member";
    state.ownerClaimed = true;
  }
  if (!invited) state.members.push(member);
  return finish(state, meta, member.id, "member.signin", member.id, before, member);
}
export function applyCommand(
  original: State,
  subject: string,
  input: unknown,
  meta: Meta,
): Mutation {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const command = parsed.data;
  const state = structuredClone(original);
  const actor = subjectMember(state, subject);
  const access = effectivePermissions(state, actor);
  const requirePermission = (p: string) => {
    if (!access.includes(p)) fail(403, "You do not have permission for this action.");
  };
  const canDelegate = (permissions: string[]) => {
    if (!actor.owner && permissions.some((p) => !access.includes(p)))
      fail(403, "You cannot assign permissions beyond your own access.");
  };
  const levelById = (id: string) =>
    state.levels.find((level) => level.id === id) ?? fail(400, "Access level does not exist.");
  if (command.type === "profile.update") {
    if (actor.status === "suspended") fail(403, "Your membership is suspended.");
    const before = structuredClone(actor);
    actor.name = command.name;
    actor.title = command.title;
    return finish(state, meta, actor.id, command.type, actor.id, before, actor);
  }
  if (command.type === "level.save") {
    requirePermission("levels.manage");
    canDelegate(command.permissions);
    const existing = command.id ? levelById(command.id) : undefined;
    if (
      state.levels.some(
        (l) => l.name.toLowerCase() === command.name.toLowerCase() && l.id !== command.id,
      )
    )
      fail(409, "An access level with this name already exists.");
    if (existing) {
      if (!actor.owner && actor.levelId === existing.id)
        fail(403, "You cannot edit your own access level.");
      canDelegate(existing.permissions);
      for (const member of state.members.filter((m) => m.levelId === existing.id)) {
        if (member.owner && !actor.owner)
          fail(403, "Only an owner can change an owner's access level.");
        canDelegate(effectivePermissions(state, { ...member, status: "active" }));
      }
    }
    const before = existing ? structuredClone(existing) : null;
    const level = {
      id: existing?.id ?? meta.id,
      name: command.name,
      permissions: command.permissions,
    };
    if (existing) state.levels = state.levels.map((l) => (l.id === level.id ? level : l));
    else state.levels.push(level);
    return finish(state, meta, actor.id, command.type, level.id, before, level);
  }
  requirePermission("members.manage");
  if (command.type === "member.add") {
    if (state.members.some((m) => m.email === command.email))
      fail(409, "A member with this email already exists.");
    canDelegate(levelById(command.levelId).permissions);
    const member: Member = {
      id: meta.id,
      subject: null,
      email: command.email,
      name: command.name,
      title: "",
      status: "invited",
      levelId: command.levelId,
      allow: [],
      deny: [],
      owner: false,
      joinedAt: meta.now,
    };
    state.members.push(member);
    return finish(state, meta, actor.id, command.type, member.id, null, member);
  }
  const target = state.members.find((m) => m.id === command.id) ?? fail(404, "Member not found.");
  if (!actor.owner && (target.id === actor.id || target.owner || command.owner))
    fail(403, "Only an owner can make this change.");
  if (command.levelId) levelById(command.levelId);
  if ((command.status === "active" || command.status === "invited") && !command.levelId)
    fail(400, "Assign an access level before approving a member.");
  if (command.status === "active" && !target.subject)
    fail(400, "Use Invited until this person signs in.");
  if (command.status === "invited" && target.subject)
    fail(400, "This member has already signed in.");
  if (command.owner && command.status !== "active") fail(400, "An owner must be active.");
  const before = structuredClone(target);
  const next = {
    ...target,
    status: command.status,
    levelId: command.levelId,
    allow: command.allow,
    deny: command.deny,
    owner: command.owner,
  };
  canDelegate(effectivePermissions(state, { ...target, status: "active" }));
  canDelegate([
    ...(next.levelId ? levelById(next.levelId).permissions : []),
    ...next.allow,
    ...next.deny,
  ]);
  Object.assign(target, next);
  if (!state.members.some((m) => m.owner && m.status === "active"))
    fail(400, "Keep at least one active owner.");
  return finish(state, meta, actor.id, command.type, target.id, before, target);
}
export function memberView(state: State, subject: string): View {
  const me = subjectMember(state, subject);
  const permissions = effectivePermissions(state, me);
  const manage = permissions.includes("members.manage");
  const directory = permissions.includes("members.read") || manage;
  return {
    revision: state.revision,
    organization: "Slice Consulting",
    me,
    permissions,
    members: !directory
      ? []
      : manage
        ? state.members
        : state.members
            .filter((m) => m.status === "active")
            .map((m) => ({
              id: m.id,
              name: m.name || "Member",
              title: m.title,
              levelName: state.levels.find((l) => l.id === m.levelId)?.name ?? "",
            })),
    levels: manage || permissions.includes("levels.manage") ? state.levels : [],
    catalog: manage || permissions.includes("levels.manage") ? permissionCatalog : [],
  };
}
