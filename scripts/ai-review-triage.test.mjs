import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { snapshot, splitSource, triage } from "./ai-review/repository-triage.mjs";
import { configFromEnv } from "./ai-review/core.mjs";
const cfg = configFromEnv({ TYPESAFE_API_KEY: "fixture" });
const state = {
  commit: "a".repeat(40),
  totalTrackedFiles: 2,
  omissions: [{ path: "logo.png", reason: "asset" }],
  files: [
    { path: "auth.ts", sha256: "b".repeat(64), chunks: splitSource("allow();\ndeny();", 10) },
  ],
};
test("triage chunks preserve every source line and reject oversized lines", () => {
  const chunks = splitSource("allow();\ndeny();", 10);
  assert.deepEqual(
    chunks.map(({ start, end }) => [start, end]),
    [
      [1, 1],
      [2, 2],
    ],
  );
  assert.equal(chunks.map((c) => c.source).join("\n"), "allow();\ndeny();");
  assert.throws(() => splitSource("x".repeat(11), 10), /bound/);
});
test("triage retains all chunks and omissions regardless of low model scores", async () => {
  const report = await triage(
    state,
    cfg,
    async () =>
      new Response(
        JSON.stringify({
          model: cfg.jevModel,
          answers: Object.fromEntries(
            ["sensitive", "concrete_defect", "test_gap"].map((key) => [
              key,
              { type: "noul", noul: 0 },
            ]),
          ),
          usage: { input_tokens: 200, output_tokens: 20 },
        }),
      ),
  );
  assert.equal(report.completedFragments, 2);
  assert.equal(report.results.length, 2);
  assert.equal(report.omissions.length, 1);
  assert.ok(!("source" in report.results[0]));
});
test("triage marks unavailable calls explicitly and stops repeated failure", async () => {
  const many = {
    ...state,
    files: [{ ...state.files[0], chunks: Array(5).fill(state.files[0].chunks[0]) }],
  };
  let calls = 0;
  const report = await triage(many, cfg, async () => {
    calls++;
    return new Response("", { status: 403 });
  });
  assert.equal(calls, 3);
  assert.equal(report.completedFragments, 0);
  assert.equal(report.plannedFragments, 5);
  assert.equal(report.results[0].answers, null);
  assert.equal(report.results.length, 5);
  assert.equal(report.results[3].status, "not-attempted");
  assert.equal(report.results[3].path, "auth.ts");
});
test("triage rejects spend or call bounds before any provider call", async () => {
  const huge = {
    ...state,
    files: [{ ...state.files[0], chunks: Array(121).fill(state.files[0].chunks[0]) }],
  };
  const never = () => {
    throw new Error("must not call");
  };
  await assert.rejects(triage(huge, cfg, never), /120-call/);
  await assert.rejects(triage(state, { ...cfg, jevRate: 100 }, never), /reservation/);
});

test("snapshot includes Cloudflare JSONC config and records non-source exclusions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "slice-triage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init");
  await writeFile(join(root, "wrangler.jsonc"), '{ // config\n "name": "fixture" }');
  await writeFile(join(root, "README.md"), "Documentation");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture",
  );
  const result = snapshot(root);
  assert.deepEqual(
    result.files.map((f) => f.path),
    ["wrangler.jsonc"],
  );
  assert.deepEqual(
    result.omissions.map((f) => f.path),
    ["README.md"],
  );
});

test("Jev fixture evaluation withholds labels and does not call on incomplete input", async () => {
  const { evaluateJev } = await import("./ai-review/evaluate-jev.mjs");
  let calls = 0;
  const result = await evaluateJev(cfg, async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.state.complete, true);
    assert.equal(body.state.expectedBug, undefined);
    assert.equal(body.state.expectedStatus, undefined);
    return new Response(
      JSON.stringify({
        model: cfg.jevModel,
        answers: { introduced_bug: { type: "noul", noul: 0.5 } },
        usage: { input_tokens: 200, output_tokens: 20 },
      }),
    );
  });
  assert.equal(calls, 6);
  assert.equal(result.rows.length, 7);
  assert.equal(result.rows.at(-1).status, "incomplete-no-call");
  assert.ok(result.rows[0].contextSha256);
});

test("Jev fixture evaluation rejects malformed answers instead of scoring them", async () => {
  const { evaluateJev } = await import("./ai-review/evaluate-jev.mjs");
  const result = await evaluateJev(
    cfg,
    async () =>
      new Response(
        JSON.stringify({
          model: cfg.jevModel,
          answers: { introduced_bug: { type: "noul", noul: 2 } },
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      ),
  );
  assert.ok(
    result.rows
      .slice(0, 6)
      .every((row) => row.status === "failed" && row.predictedBug === undefined),
  );
});
