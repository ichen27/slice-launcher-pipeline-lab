import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import { fixtures, oracle, applyCandidate } from "./ai-review/architecture-fixtures.mjs";
import {
  reservation,
  validateAnswer,
  validateSignals,
  score,
} from "./ai-review/architecture-lab.mjs";
import { configFromEnv } from "./ai-review/core.mjs";
const repository = process.cwd();
test("architecture experiment mutations have executable ground truth and nonregressing repairs", () => {
  for (const f of fixtures(repository)) {
    assert.deepEqual(oracle(f.context.sources, repository), f.expected ? [f.expected] : []);
    const results = f.context.candidates.map((c) => ({
      id: c.id,
      failures: oracle(applyCandidate(f, c.id), repository),
    }));
    assert.ok(results.some((r) => r.failures.length === 0));
    assert.ok(results.some((r) => r.failures.length > 0));
    if (!f.expected) {
      const keep = f.context.candidates.find((c) => c.edit === null);
      assert.equal(
        score({ hasIssue: false, candidateId: keep.id }, f, repository).repairPass,
        true,
      );
    }
  }
});
test("architecture experiment refuses invented repair IDs and source evidence", () => {
  const f = fixtures(repository)[0];
  const keep = f.context.candidates.find((c) => c.edit === null).id;
  assert.throws(() => applyCandidate(f, "invented"));
  assert.throws(() =>
    validateAnswer({ hasIssue: false, findings: [], candidateId: "invented" }, f.context),
  );
  assert.throws(() =>
    validateAnswer(
      {
        hasIssue: true,
        findings: [{ path: f.context.change.path, evidence: "fabricated", explanation: "bad" }],
        candidateId: keep,
      },
      f.context,
    ),
  );
  assert.throws(() =>
    validateAnswer({ hasIssue: true, findings: [], candidateId: keep }, f.context),
  );
  assert.throws(() => validateSignals({ answers: {} }, f.context));
});
test("architecture experiment preflights all calls before spending and excludes oracle labels", () => {
  const cases = fixtures(repository),
    cfg = configFromEnv({});
  assert.ok(reservation(cases, cfg) > 0);
  assert.ok(reservation(cases, cfg) <= 5);
  assert.throws(() => reservation([...cases, ...cases], cfg));
  for (const f of cases) {
    assert.equal(Object.hasOwn(f.context, "expected"), false);
    assert.equal(Object.hasOwn(f.context, "tests"), false);
  }
});

test("architecture failures retain costs and explicit unavailable routing outcomes", async () => {
  const { runExperiment } = await import("./ai-review/architecture-lab.mjs");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "slice-lab-report-"));
  const cfg = configFromEnv({
    GPT_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    GPT_CLOUDFLARE_API_TOKEN: "test",
    JEV_PROVIDER: "cloudflare",
    JEV_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    JEV_CLOUDFLARE_API_TOKEN: "test",
  });
  let calls = 0;
  try {
    const report = await runExperiment({
      repository,
      cfg,
      outputDirectory: dir,
      fetcher: async (url) => {
        calls++;
        if (url.endsWith("/ai/run"))
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                state: "Completed",
                result: {
                  model: "jev-1.13.0",
                  answers: {},
                  usage: { input_tokens: 30, output_tokens: 1 },
                },
              },
            }),
          );
        return new Response("unavailable", { status: 503 });
      },
    });
    assert.equal(calls, 3);
    assert.equal(report.runs.length, 32);
    assert.ok(report.runs[0].estimatedUsd > 0);
    assert.equal(report.runs[0].failureStage, "invalid-output");
    assert.equal(report.runs.find((r) => r.arm === "routed-derived").status, "unavailable");
    assert.equal(report.runs.find((r) => r.arm === "gpt").estimatedUsd, null);
    assert.equal(report.runs.filter((r) => r.status === "not-attempted").length, 28);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
