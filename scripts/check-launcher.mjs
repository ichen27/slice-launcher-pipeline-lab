import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import console from "node:console";
import { pathToFileURL } from "node:url";

class RolloutPending extends Error {}

export async function checkLauncher(
  baseUrl,
  { signal, access, expectedRelease, timeoutMs = 30000, retryDelayMs = 500 } = {},
) {
  const base = new URL(baseUrl);
  const request = (path) => {
    const target = new URL(path, base);
    assert.equal(target.origin, base.origin, "Assets must use the same origin");
    return fetch(target, {
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
      headers: {
        "User-Agent": "slice-launcher-smoke/1.0",
        ...(access
          ? { "CF-Access-Client-Id": access.id, "CF-Access-Client-Secret": access.secret }
          : {}),
      },
    });
  };

  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const health = await request("/api/health");
      if ([404, 502, 503, 504].includes(health.status)) {
        await health.body?.cancel();
        throw new RolloutPending("Health route is propagating");
      }
      assert.equal(health.status, 200, "Health endpoint must return 200");
      const body = await health.json();
      assert.equal(body.status, "ok");
      if (expectedRelease && body.release !== expectedRelease) {
        throw new RolloutPending("Intended release is not serving yet");
      }
      break;
    } catch (error) {
      // Startup connection failures and an explicitly old/transient route are retryable.
      // Authentication, malformed JSON, and unexpected responses fail immediately.
      if (
        signal?.aborted ||
        Date.now() >= deadline ||
        !(
          error instanceof RolloutPending ||
          (error instanceof TypeError && error.cause?.code === "ECONNREFUSED")
        )
      )
        throw error;
      await delay(retryDelayMs, undefined, { signal });
    }
  }

  const page = await request("/");
  assert.equal(page.status, 200, "Launcher page must return 200");
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  const html = await page.text();
  assert.match(html, /App Launcher/);

  const assets = new Map();
  for (const tag of html.matchAll(/<(?:link|script)\b[^>]*>/gi)) {
    const url = tag[0].match(/(?:href|src)="([^"]+)"/i)?.[1];
    const normalizedTag = tag[0].toLowerCase();
    if (!url || !url.startsWith("/") || url.startsWith("//")) continue;
    if (normalizedTag.startsWith("<link") && /rel="stylesheet"/i.test(tag[0]))
      assets.set(url, "text/css");
    if (normalizedTag.startsWith("<script") && /\bsrc=/i.test(tag[0]))
      assets.set(url, "javascript");
  }
  assert.ok([...assets.values()].includes("text/css"), "Page must reference a stylesheet");
  assert.ok([...assets.values()].includes("javascript"), "Page must reference its JavaScript");
  for (const [url, type] of assets) {
    const response = await request(url);
    assert.equal(response.status, 200, `Asset failed: ${url}`);
    assert.ok(
      (response.headers.get("content-type") ?? "").includes(type),
      `Wrong asset type: ${url}`,
    );
    assert.ok((await response.text()).length > 0, `Empty asset: ${url}`);
  }
  console.log(
    `Launcher page, health endpoint, and ${assets.size} assets passed at ${base.origin}.`,
  );
}

export async function checkMembershipDenied(
  baseUrl,
  { access, retryDelayMs = 1000, timeoutMs = 30000 },
) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const response = await fetch(new URL("/api/membership", baseUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { "CF-Access-Client-Id": access.id, "CF-Access-Client-Secret": access.secret },
    });
    // The previous Worker version has no membership route during initial propagation.
    // Retry only that 404; successful data access or any other auth result fails immediately.
    if (response.status === 404 && Date.now() < deadline) {
      await response.body?.cancel();
      await delay(retryDelayMs);
      continue;
    }
    assert.equal(response.status, 401, "Service identity must not access membership data");
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    await response.body?.cancel();
    console.log("Membership API rejects the CI service identity.");
    return;
  }
}

export async function checkAccessBoundary(baseUrl, accessDomain) {
  const domain = new URL(accessDomain);
  assert.equal(domain.protocol, "https:");
  assert.ok(domain.hostname.endsWith(".cloudflareaccess.com"));
  for (const path of ["/", "/api/membership"]) {
    const response = await fetch(new URL(path, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    assert.ok(
      [302, 303, 307].includes(response.status),
      "Unauthenticated request must be redirected to Access",
    );
    const target = new URL(response.headers.get("location"));
    assert.equal(target.origin, domain.origin, "Unexpected Access login origin");
    assert.ok(target.pathname.startsWith("/cdn-cgi/access/login"), "Expected Access login");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  assert.ok(process.argv[2], "Usage: node scripts/check-launcher.mjs <base-url>");
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  assert.equal(Boolean(id), Boolean(secret), "Both Access service credentials are required");
  if (id && secret) {
    assert.ok(process.env.ACCESS_TEAM_DOMAIN, "Expected Access team domain is required");
    await checkAccessBoundary(process.argv[2], process.env.ACCESS_TEAM_DOMAIN);
    await checkMembershipDenied(process.argv[2], { access: { id, secret } });
  }
  await checkLauncher(process.argv[2], {
    access: id && secret ? { id, secret } : undefined,
    expectedRelease: process.env.EXPECTED_RELEASE_SHA,
  });
  if (id && secret) await checkMembershipDenied(process.argv[2], { access: { id, secret } });
}
