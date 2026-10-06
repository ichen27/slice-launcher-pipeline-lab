import { z } from "zod";
import { readCommand } from "./auth";
import { applyCommand, effectivePermissions, enroll, memberView } from "./domain";
import { MembershipError } from "./contracts";
import type { Identity } from "./contracts";
import type { Repository } from "./repository";
const envelope = z.strictObject({
  revision: z.number().int().nonnegative().optional(),
  command: z.unknown(),
});
const join = z.strictObject({ type: z.literal("join") });
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Cf-Access-Jwt-Assertion",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof MembershipError) return json({ error: error.message }, error.status);
  console.error(
    JSON.stringify({
      event: "membership_request_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return json({ error: "Membership could not be loaded. Please try again." }, 500);
}
export async function membershipRequest(
  request: Request,
  identity: Identity,
  repository: Repository,
): Promise<Response> {
  const state = await repository.load();
  if (request.method === "GET") {
    const member = state.members.find((m) => m.subject === identity.subject);
    if (!member) return json({ needsEnrollment: true });
    if (member.email !== identity.email)
      throw new MembershipError(403, "Your identity changed. Contact an administrator.");
    if (new URL(request.url).searchParams.get("view") === "history") {
      if (!effectivePermissions(state, member).includes("audit.read"))
        throw new MembershipError(403, "You do not have permission to view access history.");
      return json({ history: await repository.history() });
    }
    return json(memberView(state, identity.subject));
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = envelope.safeParse(await readCommand(request));
  if (!body.success) throw new MembershipError(400, "Invalid membership request.");
  if (join.safeParse(body.data.command).success) {
    const result = enroll(state, identity, {
      id: crypto.randomUUID(),
      now: new Date().toISOString(),
    });
    if (result.audit) await repository.commit(state, { ...result, audit: result.audit });
    return json(memberView(result.state, identity.subject));
  }
  const member = state.members.find((m) => m.subject === identity.subject);
  if (!member || member.email !== identity.email)
    throw new MembershipError(403, "Complete sign-in before making changes.");
  if (body.data.revision !== state.revision)
    throw new MembershipError(409, "Membership changed. Reload before saving.");
  const result = applyCommand(state, identity.subject, body.data.command, {
    id: crypto.randomUUID(),
    now: new Date().toISOString(),
  });
  await repository.commit(state, result);
  return json(memberView(result.state, identity.subject));
}
