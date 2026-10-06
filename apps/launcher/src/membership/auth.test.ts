import { beforeAll, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyIdentity, readCommand } from "./auth";
const config = { issuer: "https://test.cloudflareaccess.com", audience: "slice-aud" };
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let resolver: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  pair = await generateKeyPair("RS256");
  resolver = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test" }] });
});
async function token(overrides = {}) {
  return new SignJWT({ type: "app", sub: "person", email: "person@example.test", ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
}
function request(jwt: string) {
  return new Request("https://slice.example/api/membership", {
    headers: { "Cf-Access-Jwt-Assertion": jwt },
  });
}
it("accepts a signed human identity", async () => {
  expect(await verifyIdentity(request(await token()), config, resolver)).toEqual({
    subject: `${config.issuer}|person`,
    email: "person@example.test",
  });
});
it("rejects missing, tampered, wrong-audience, expired and service tokens", async () => {
  await expect(verifyIdentity(request(""), config, resolver)).rejects.toMatchObject({
    status: 401,
  });
  const jwt = await token();
  await expect(
    verifyIdentity(request(jwt.slice(0, -10) + "xxxxxxxxxx"), config, resolver),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    verifyIdentity(request(jwt), { ...config, audience: "other" }, resolver),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    verifyIdentity(
      request(await token({ email: undefined, common_name: "service" })),
      config,
      resolver,
    ),
  ).rejects.toMatchObject({ status: 401 });
  const expired = await new SignJWT({ sub: "person", email: "person@example.test", type: "app" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(pair.privateKey);
  await expect(verifyIdentity(request(expired), config, resolver)).rejects.toMatchObject({
    status: 401,
  });
});
it("fails closed when Access is unconfigured", async () => {
  await expect(
    verifyIdentity(request(""), { issuer: "", audience: "" }, resolver),
  ).rejects.toMatchObject({ status: 503 });
});
it("rejects cross-origin mutations and oversized or malformed JSON", async () => {
  const make = (body: string, origin = "https://slice.example") =>
    new Request("https://slice.example/api/membership", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
    });
  await expect(readCommand(make("{}", "https://evil.example"))).rejects.toMatchObject({
    status: 403,
  });
  await expect(readCommand(make("x"))).rejects.toMatchObject({ status: 400 });
  await expect(readCommand(make("x".repeat(20000)))).rejects.toMatchObject({ status: 413 });
  expect(await readCommand(make('{"command":{"type":"join"}}'))).toEqual({
    command: { type: "join" },
  });
});

it("rejects wrong issuer, invalid claims, unsupported algorithms and oversized assertions", async () => {
  for (const payload of [
    { type: "service" },
    { sub: "" },
    { sub: "x".repeat(257) },
    { email: "invalid" },
    { common_name: "service", email: "person@example.test" },
    { type: undefined },
  ]) {
    await expect(
      verifyIdentity(request(await token(payload)), config, resolver),
    ).rejects.toMatchObject({ status: 401 });
  }
  await expect(
    verifyIdentity(
      request(await token()),
      { ...config, issuer: "https://other.cloudflareaccess.com" },
      resolver,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(verifyIdentity(request("x".repeat(16385)), config, resolver)).rejects.toMatchObject({
    status: 401,
  });
  const hmac = await new SignJWT({ email: "person@example.test", sub: "person", type: "app" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode("synthetic-test-key-only-32-characters"));
  await expect(verifyIdentity(request(hmac), config, resolver)).rejects.toMatchObject({
    status: 401,
  });
});
it("rejects missing bodies, wrong media types and missing origins", async () => {
  const url = "https://slice.example/api/membership";
  await expect(
    readCommand(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://slice.example", "content-type": "application/json" },
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readCommand(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://slice.example", "content-type": "text/plain" },
        body: "{}",
      }),
    ),
  ).rejects.toMatchObject({ status: 415 });
  await expect(
    readCommand(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
