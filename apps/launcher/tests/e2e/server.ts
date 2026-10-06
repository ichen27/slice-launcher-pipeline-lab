// slice-e2e-only: this file is never an application/Worker entry point.
import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { createLocalJWKSet, exportJWK } from "jose";
import { verifyIdentity } from "../../src/membership/auth";
import { errorResponse, membershipRequest } from "../../src/membership/api";
import { Repository } from "../../src/membership/repository";
import { database, migrate, reset } from "../database";
import { authConfig, keyPair, createIdentityKey } from "./identity";

const fixture = await database();
await migrate(fixture.db);
await reset(fixture.db);
const repo = new Repository(fixture.db);
await createIdentityKey();
const pair = await keyPair();
const keys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(pair.publicKey)), kid: "slice-e2e-only" }],
});
const vite = await createViteServer({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  server: { middlewareMode: true, fs: { deny: ["**/.e2e/**", "**/.env*", "**/*.{crt,pem}"] } },
  appType: "custom",
});
const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/membership")) {
      const body =
        req.method === "POST"
          ? await new Promise<string>((resolve, reject) => {
              let content = "";
              req.on("data", (chunk) => {
                content += chunk;
                if (content.length > 32768) req.destroy(new Error("oversized test request"));
              });
              req.on("end", () => resolve(content));
              req.on("error", reject);
            })
          : undefined;
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value) headers.set(name, Array.isArray(value) ? value.join(",") : value);
      const request = new Request(`http://127.0.0.1:4173${req.url}`, {
        method: req.method,
        headers,
        body,
      });
      let response: Response;
      try {
        // Exactly the production cryptographic verifier; no email/header/unsigned bypass.
        const identity = await verifyIdentity(request, authConfig, keys);
        response = await membershipRequest(request, identity, repo);
      } catch (error) {
        response = errorResponse(error);
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } else if (req.url === "/" || req.url === "/account") {
      const html = await vite.transformIndexHtml(
        req.url,
        `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Slice synthetic browser tests</title></head><body><div id="root"></div><script type="module" src="/tests/e2e/main.tsx"></script></body></html>`,
      );
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } else
      vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end();
      });
  } catch {
    res.writeHead(500);
    res.end("Synthetic harness error");
  }
});
server.listen(4173, "127.0.0.1");
async function close() {
  server.close();
  await vite.close();
  await fixture.runtime.dispose();
  await rm(new URL("../../.e2e/identity-key.pem", import.meta.url), { force: true });
  process.exit(0);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
