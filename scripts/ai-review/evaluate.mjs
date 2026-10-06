import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { configFromEnv, review, LIMITS, PROMPT, OUTPUT_SCHEMA } from "./core.mjs";

// Independent labels are loaded only by the scorer, never sent to either provider.
export function scoreRun(result, expected) {
  const matched = new Set();
  const candidates = result.findings.map((finding, index) => {
    const match = expected.findings.findIndex(
      (label) =>
        label.path === finding.path && finding.start <= label.end && finding.end >= label.start,
    );
    if (match >= 0) matched.add(match);
    return {
      index,
      matchedLabel: match < 0 ? null : match,
      actionability: null,
      evidenceQuality: null,
      humanConfirmedBug: null,
    };
  });
  return {
    statusCorrect: result.status === expected.expectedStatus,
    detectedCandidates: matched.size,
    missedCandidates: expected.findings.length - matched.size,
    falsePositiveCandidates: candidates.filter((item) => item.matchedLabel === null).length,
    candidates,
    humanReviewRequired: true,
  };
}

export async function evaluate({ live = false, env = {}, fetcher = fetch } = {}) {
  const fixtureRoot = new URL("./fixtures/", import.meta.url);
  const contexts = JSON.parse(await readFile(new URL("contexts.json", fixtureRoot), "utf8"));
  const labels = JSON.parse(await readFile(new URL("expected.json", fixtureRoot), "utf8"));
  const mocks = JSON.parse(await readFile(new URL("mock-responses.json", fixtureRoot), "utf8"));
  if (contexts.length > 10) throw new Error("Evaluation fixture bound exceeded");
  if (
    live &&
    (env.AI_EVAL_LIVE !== "true" ||
      !((env.GPT_PROVIDER || "cloudflare") === "cloudflare"
        ? env.GPT_CLOUDFLARE_API_TOKEN
        : env.OPENAI_API_KEY) ||
      !(env.JEV_PROVIDER === "cloudflare" ? env.JEV_CLOUDFLARE_API_TOKEN : env.TYPESAFE_API_KEY))
  )
    throw new Error(
      "Live A/B evaluation requires explicit opt-in and both project-scoped credentials",
    );
  const cfg = configFromEnv(
    live
      ? { ...env, AI_JEV_ENABLED: "true" }
      : {
          GPT_PROVIDER: "openai",
          OPENAI_API_KEY: "mock",
          TYPESAFE_API_KEY: "mock",
          AI_JEV_ENABLED: "true",
        },
  );
  // Conservative preflight budget for every arm, includes full output limit on every call.
  const worstUsd = contexts.reduce(
    (total, { context }) =>
      total +
      (2 *
        ((Buffer.byteLength(JSON.stringify(context) + PROMPT + JSON.stringify(OUTPUT_SCHEMA)) +
          4096) *
          cfg.reserveInputRate +
          LIMITS.outputTokens * cfg.reserveOutputRate +
          28048 * cfg.jevRate)) /
        1e6,
    0,
  );
  const maxUsd = Number(env.AI_EVAL_MAX_USD || 3);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 3 || worstUsd > maxUsd)
    throw new Error("Evaluation cost reservation exceeds hard $3 bound");
  const runs = [];
  for (const { id, context } of contexts) {
    for (const assisted of [false, true]) {
      const mockFetch = async (url) =>
        new Response(
          JSON.stringify(
            url.includes("typesafe")
              ? {
                  model: cfg.jevModel,
                  answers: {
                    sensitive: { type: "noul", noul: 0.5 },
                    test_gap: { type: "noul", noul: 0.5 },
                  },
                  usage: { input_tokens: 100, output_tokens: 10 },
                }
              : {
                  model: cfg.gptModel,
                  status: "completed",
                  output: [
                    {
                      type: "message",
                      content: [{ type: "output_text", text: JSON.stringify(mocks[id]) }],
                    },
                  ],
                  usage: { input_tokens: 100, output_tokens: 100 },
                },
          ),
          { status: 200 },
        );
      const result = await review(
        context,
        { ...cfg, jevEnabled: assisted },
        live ? fetcher : mockFetch,
      );
      runs.push({
        id,
        arm: assisted ? "B: Jev-assisted GPT" : "A: GPT alone",
        contextSha256: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
        result,
        score: scoreRun(
          result,
          labels.find((label) => label.id === id),
        ),
      });
    }
  }
  return {
    mode: live ? "live" : "mock-plumbing-only",
    createdAt: new Date().toISOString(),
    config: {
      gptModel: cfg.gptModel,
      gptProvider: cfg.gptProvider,
      jevModel: cfg.jevModel,
      jevProvider: cfg.jevProvider,
      maxOutputTokens: LIMITS.outputTokens,
      maxCallsPerArm: 2,
      timeoutMs: LIMITS.timeoutMs,
      retries: 0,
      reservedUpperUsd: worstUsd,
      hardEvaluationUsd: maxUsd,
    },
    interpretation: live
      ? "Candidate counts require independent human review of bug meaning, actionability and evidence before deciding whether Jev helps."
      : "Synthetic fixed responses verify A/B plumbing only. These are not measured model accuracy, cost or latency and do not establish any Jev benefit.",
    humanRubric: {
      actionability: "0 unsupported; 1 vague; 2 specific fix with concrete failure",
      evidenceQuality:
        "0 wrong; 1 source citation only; 2 source demonstrates the failure and caller context",
      humanConfirmedBug: "true/false after reading the independent expected label and source",
    },
    runs,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await evaluate({ live: process.argv.includes("--live"), env: process.env });
  await mkdir("ai-review-output", { recursive: true });
  const path =
    "ai-review-output/evaluation-" + (result.mode === "live" ? "live" : "mock") + ".json";
  await writeFile(path, JSON.stringify(result, null, 2) + "\n");
  console.log(
    result.mode +
      ": " +
      result.runs.length +
      " fixture/arm runs. " +
      result.interpretation +
      " Saved " +
      path,
  );
}
