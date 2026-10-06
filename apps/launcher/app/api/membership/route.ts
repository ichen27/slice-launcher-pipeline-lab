import { env } from "cloudflare:workers";
import { verifyIdentity } from "../../../src/membership/auth";
import { errorResponse, membershipRequest } from "../../../src/membership/api";
import { Repository } from "../../../src/membership/repository";

export async function GET(request: Request) {
  try {
    const identity = await verifyIdentity(request, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    return await membershipRequest(request, identity, new Repository(env.MEMBERSHIP_DB));
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = GET;
