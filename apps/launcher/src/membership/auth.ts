import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { emailSchema, MembershipError } from "./contracts";
import type { Identity } from "./contracts";
export interface AuthConfig {
  issuer: string;
  audience: string;
}
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyIdentity(
  request: Request,
  config: AuthConfig,
  keys?: JWTVerifyGetKey,
): Promise<Identity> {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.issuer) || !config.audience)
    throw new MembershipError(503, "Sign-in is not configured yet.");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16384) throw new MembershipError(401, "Sign in to continue.");
  if (!keys) {
    let remote = keySets.get(config.issuer);
    if (!remote) {
      remote = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", config.issuer));
      keySets.set(config.issuer, remote);
    }
    keys = remote;
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "email", "exp", "iat"],
      clockTolerance: 5,
    });
    const email = emailSchema.safeParse(payload.email);
    if (
      !email.success ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      payload.sub.length > 256 ||
      payload.type !== "app" ||
      payload.common_name
    )
      throw new Error("Human identity required");
    return { subject: `${config.issuer}|${payload.sub}`, email: email.data };
  } catch {
    throw new MembershipError(401, "Your sign-in could not be verified. Sign in again.");
  }
}
export async function readCommand(request: Request): Promise<unknown> {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new MembershipError(403, "This request must come from the Slice app.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new MembershipError(415, "Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new MembershipError(400, "Missing request body.");
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new MembershipError(413, "Request is too large.");
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    return JSON.parse(body);
  } catch {
    throw new MembershipError(400, "Invalid JSON.");
  }
}
