import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { checkLauncher } from "./check-launcher.mjs";

// Use a free loopback port so the probe does not reuse a developer server.
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);

const worker = spawn(
  "./node_modules/.bin/wrangler",
  [
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    "0",
  ],
  {
    cwd: fileURLToPath(new URL("../apps/launcher/", import.meta.url)),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
worker.stdout.on("data", (data) => {
  logs = (logs + data).slice(-16000);
});
worker.stderr.on("data", (data) => {
  logs = (logs + data).slice(-16000);
});
const controller = new AbortController();
worker.once("error", (error) => controller.abort(error));
worker.once("exit", (code) => controller.abort(new Error(`Wrangler exited (${code})`)));

const interrupted = () => controller.abort(new Error("Smoke check interrupted"));
process.once("SIGINT", interrupted);
process.once("SIGTERM", interrupted);

function signalWorkerGroup(signal) {
  if (!worker.pid) return false;
  try {
    process.kill(-worker.pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

try {
  await checkLauncher(`http://127.0.0.1:${port}`, {
    signal: controller.signal,
    expectedRelease: process.env.SLICE_RELEASE_SHA,
  });
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  signalWorkerGroup("SIGTERM");
  const deadline = Date.now() + 3000;
  while (signalWorkerGroup(0) && Date.now() < deadline) await delay(50);
  if (signalWorkerGroup(0)) signalWorkerGroup("SIGKILL");
  process.removeListener("SIGINT", interrupted);
  process.removeListener("SIGTERM", interrupted);
}
