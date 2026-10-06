import { env } from "cloudflare:workers";
import { verifyIdentity } from "../../../../src/membership/auth";
import { errorResponse } from "../../../../src/membership/api";
export async function GET(request: Request) {
  try {
    await verifyIdentity(request, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
    return new Response(null, {
      status: 303,
      headers: { Location: "/account", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
