// slice-e2e-only: per-run ephemeral key; private key never crosses the browser boundary.
import { generateKeyPairSync, createPrivateKey, createPublicKey } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { SignJWT } from "jose";
export const authConfig = {
  issuer: "https://slice-e2e-only.cloudflareaccess.com",
  audience: "slice-e2e-only",
};
const path = new URL("../../.e2e/identity-key.pem", import.meta.url);
export async function createIdentityKey() {
  await mkdir(new URL("../../.e2e/", import.meta.url), { recursive: true });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(path, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
}
export async function keyPair() {
  const privateKey = createPrivateKey(await readFile(path));
  return { privateKey, publicKey: createPublicKey(privateKey) };
}
export async function identityToken(email: string, extra: Record<string, unknown> = {}) {
  const { privateKey } = await keyPair();
  return new SignJWT({ type: "app", email, ...extra })
    .setProtectedHeader({ alg: "RS256", kid: "slice-e2e-only" })
    .setIssuer(authConfig.issuer)
    .setAudience(authConfig.audience)
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}
