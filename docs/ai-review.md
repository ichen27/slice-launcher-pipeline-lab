# Advisory AI review

GPT-6 Sol through Cloudflare is the primary reviewer. The PR workflow fixes `AI_JEV_ENABLED=false` and receives no Jev credential; Jev remains available only in explicitly invoked experiments. Neither changes the required `validate` gate, approves a PR, merges, deploys, or edits code. AI review can miss bugs. The original 2026-10-04 implementation used mocks only. The current primary route is Cloudflare GPT-6 Sol (2026-10-06); GitHub activation remains pending.

## Trust boundary

`ai-review.yml` runs on `pull_request_target` against **main only**, or by explicit dispatch from main. Every checkout uses the exact protected PR base SHA (the protected workflow SHA for manual dispatch). No PR checkout, package install, import, build, test, shell command, cache, dependency hook, or contributor artifact runs in any review job. Node builtins read GitHub API data. Fixed full-SHA Actions are the only external executable dependencies.

The provider job has read-only GitHub permissions and the `ai-review` environment. It reads public contributor source as untrusted data, including fork source, while running protected review code. Ordinary contributor CI jobs receive no provider credentials. Model keys exist only in the inference step. The separate publisher has PR comment permission, no provider environment or keys, and revalidates findings against source fetched independently. The model has no tools. Provider endpoints are fixed HTTPS URLs with redirects rejected; source cannot select an endpoint.

The small report artifact contains validated findings and accounting metadata, not raw provider responses, provider errors, credentials, or full context. It is retained for three days. The publisher limits artifact size, validates the complete envelope, verifies expected base/head, fetches source again before publishing findings, escapes Markdown/HTML and mentions, and updates one bot-owned marker comment. It never interprets artifact values as commands or a PR number.

New commits replace the summary with pending status and make earlier findings stale. Final publication rechecks the head and base. Every comment explicitly applies only to its recorded SHA, so a push racing the final API write is visibly outside scope. Concurrency cancels superseded work. Missing artifacts, unavailable providers, refusals, malformed output, and incomplete review have distinct visible states; none becomes “no findings.”

## Review scope and bounded cost

Input includes exact base/head commits, changed full source on both sides, complete changed patches, trusted project standards, PR description, head/merge-commit check statuses, and surrounding textual files from touched apps and shared packages. Tooling changes also include tooling context. Check statuses are point-in-time metadata; a pending check is not a pass. Check names and PR text remain untrusted. Use manual dispatch after deterministic checks finish when a later snapshot is useful.

The branch must contain its current base. Changed-file enumeration must agree with GitHub's PR count. Truncated trees/patches, unsupported binary or rename changes, sensitive paths, missing source, or exceeded bounds produce incomplete review without a provider call. The broad surrounding-file scope is deterministic; it is not a guarantee that every runtime dependency was captured. GPT must report incomplete if necessary cross-file evidence is absent.

Hard bounds in trusted code:

| Bound                        | Limit                                                 |
| ---------------------------- | ----------------------------------------------------- |
| Changed files / source blobs | 40 / 80                                               |
| Full serialized context      | 180,000 UTF-8 bytes                                   |
| Provider calls               | At most one GPT and one Jev; zero retries             |
| Timeout                      | 90 seconds per provider                               |
| GPT output                   | 4,096 tokens, including reasoning                     |
| Provider response body       | 80,000 bytes                                          |
| Jev request                  | 26,000 UTF-8 bytes; otherwise Jev alone is incomplete |
| GitHub requests              | 220, each with a 15-second timeout and bounded body   |
| Per-review reserved cost     | At most $1; configurable downward                     |
| Findings / public comment    | 8 / 18,000 bytes                                      |

The preflight reserves both calls before spending, using UTF-8 byte count as a conservative token upper bound, framing/schema reserves, configured input rates, and the full GPT output allowance. The rates must match current provider billing. Network failures can still incur provider charges; missing usage is **unknown** (`estimatedUsd: null`), not free. Job timeouts and provider project spending limits provide additional limits. Frequent PR events/reruns multiply spend, so set provider-level monthly limits. No per-run cap substitutes for a monthly project limit.

Provider documentation (GPT route updated 2026-10-06):

- [Cloudflare GPT-6 Sol](https://developers.cloudflare.com/ai/models/openai/gpt-6-sol/): `openai/gpt-6-sol` through account-scoped `/ai/v1/responses`. Strict structured output; `store: false`, no tools or redirects. Returned model must match; no fallback. This catalog alias is not an immutable dated snapshot. Short-context estimates use $2/M input and $10/M output; reservations use the highest published $5/M input/cache-write and $15/M output rates.
- [TypeSafe API](https://docs.typesafe.ai/api): `POST https://api.typesafe.ai/v1/systemone`; fixed `state` and typed `questions`. Two Noul questions ask about sensitive boundaries and test priorities.
- [TypeSafe models](https://docs.typesafe.ai/models): default pinned `jev-1.13.0`; $0.042/M input, output free; 32k tokens for state plus longest question and 64k aggregate.

Example assumption: 20,000 GPT input tokens and 2,000 output tokens cost about **$0.06**; 10,000 Jev input tokens add **$0.00042**. This is an estimate, not measured usage. OpenAI API billing is separate from ChatGPT/Codex subscriptions. Account access/credits must be checked in the provider projects. Cloudflare unified billing funds the selected route; no OpenAI key is needed. Token estimates exclude cache discounts and the 5% Cloudflare credit-purchase fee; they are not invoices.

Jev receives changed patches, never credentials. Its output must be exactly the two typed numeric answers. GPT independently receives all original source/context and may also receive those optional answers. Jev failure cannot suppress GPT, discard source, or skip security review. Unknown models require explicit current pricing configuration.

## Activation and bootstrap

1. Merge only after the user approves the completed PR. Because review code is taken from protected base, this first PR cannot exercise its new privileged workflow from contributor code. Its mocks and unprivileged checks exercise the implementation. After merge, dispatch a representative PR from main and verify the actual comment and accounting artifact.
2. Create GitHub environment `ai-review`, restrict deployment branches to protected main, and add a dedicated inference-only `GPT_CLOUDFLARE_API_TOKEN` plus `GPT_CLOUDFLARE_ACCOUNT_ID`. For local experiments only, use `JEV_PROVIDER=cloudflare`, `JEV_CLOUDFLARE_ACCOUNT_ID`, and `JEV_CLOUDFLARE_API_TOKEN`; the PR workflow does not receive these values. Do not reuse deployment credentials or upload personal Wrangler OAuth credentials. Configure keys in the provider/GitHub UI; never paste them into chat or commit them.
3. Configure environment/repository variables below. The PR workflow fixes `AI_JEV_ENABLED=false`; a repository variable cannot enable Jev. Set provider project spending limits.
4. Exercise same-repository and fork PRs. Verify protected code is used, comments stay tied to head SHA, failures remain advisory, and required CI still blocks independently.
5. Run and manually score the live A/B evaluation before deciding to make Jev standard.

| Variable                                                   | Default / rule                                         |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `OPENAI_REVIEW_MODEL`                                      | `gpt-6-sol` (fixed in workflow)                        |
| `TYPESAFE_REVIEW_MODEL`                                    | `jev-1.13.0`                                           |
| `AI_JEV_ENABLED`                                           | Fixed `false` in PR workflow; local experiments opt in |
| `AI_MAX_USD`                                               | `1`; positive and no higher than 1                     |
| `GPT_INPUT_USD_PER_MILLION` / `GPT_OUTPUT_USD_PER_MILLION` | Required for nondefault GPT model                      |
| `JEV_INPUT_USD_PER_MILLION`                                | Required for nondefault Jev model                      |

## Reproducible A/B evaluation

Run `node scripts/ai-review/evaluate.mjs` for a **mock integration** run. Seven deliberately constructed fixtures cover active membership, deny precedence, audit atomicity, a secret-bearing workflow, prompt injection, a clean refactor, and incomplete context. Independent expected labels live in `fixtures/expected.json`; providers receive only `fixtures/contexts.json`. Fixed mock responses are a third file. The SHA-256 of the original context is recorded for each arm.

A uses GPT alone. B uses Jev plus the same GPT prompt, original context, exact requested model, output limit, timeout and per-review budget. Jev is an additional bounded cost. The runner records findings, provider usage/estimated cost, latency, and statuses. It preflights the entire run against a hard $3 reservation and allows at most ten fixtures (two arms each), with no retries. Current fixture counts are seven, yielding fourteen arm results; incomplete fixtures cause no provider calls.

A live run additionally requires `--live`, `AI_EVAL_LIVE=true`, explicit credentials for both provider routes in the shell environment, and sufficient budget. Do not source unrelated keys. `AI_EVAL_MAX_USD` may lower the $3 total cap. Output is written to `ai-review-output/evaluation-live.json`; keep it out of Git.

Location matching produces **candidate** detected/missed/false-positive counts. It is not a semantic quality oracle. A human must read source and the independent label, confirm actual bug meaning, and fill actionability/evidence quality using the included 0–2 rubric. Unmatched findings can be legitimate additional bugs; matching the right line alone can still be wrong. Compare prompt-injection behavior, incomplete statuses, human-confirmed detections/misses/false positives, quality, actual billed usage and latency. Report unavailable/failed arms instead of interpreting them as clean reviews. Repeat live runs if judging stability.

Implementation verification: thirteen focused tests cover source and output boundaries, Jev failure fallback, unavailable credentials, budget rejection, idempotent/stale publication, refusals, accounting-error redaction, and fixture scoring. The mock CLI produced all fourteen expected arm results. These results establish integration behavior only. **There is no measured evidence yet that Jev improves quality enough to justify enabling it by default.**

## Live Jev follow-up — 2026-10-05

The first live tests now use the verified [Cloudflare Jev route](https://developers.cloudflare.com/ai/models/typesafe/jev/), billed through [AI Gateway](https://developers.cloudflare.com/ai-gateway/features/unified-billing/). Returned model: `jev-1.13.0`. No separate TypeSafe key was needed for these local experiments.

Set `JEV_PROVIDER=cloudflare`, `JEV_CLOUDFLARE_ACCOUNT_ID`, and a dedicated inference-only `JEV_CLOUDFLARE_API_TOKEN` in the AI review environment to select this transport. The default transport remains direct TypeSafe. Do not reuse the production deployment token or upload a personal Wrangler OAuth token to CI. The local experiment used existing Wrangler authentication in memory; no token appears in Git, command arguments or reports. Cloudflare requests disable cache/log collection via request headers, reject redirects, require a completed success envelope and verify the returned model version. The gateway catalog alias is not version-pinned; a version mismatch fails the optional Jev stage while GPT continues.

### Measured evidence

| Trial                                   | Result                                                                                                                      | Returned input / output tokens | Estimated inference cost | Sum of request time |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------ | ------------------- |
| Jev binary bug triage                   | Five introduced-bug cases and one clean case classified correctly at predefined 0.5 threshold; incomplete case made no call | 3,958 / 138                    | $0.000166                | 2.279 s             |
| Repository fragment triage at `047ef3c` | 93/93 fragments covering 83 source/config files; 27 exclusions explicitly listed                                            | 120,917 / 5,301                | $0.005079                | 27.502 s            |

Costs use the published $0.042/M input rate and free output, not an invoice. The first repository pass excluded JSONC by mistake; the filter was fixed, regression-tested and the scan rerun including Wrangler configuration. The table reports the corrected run, not the first pass.

This is a small exploratory classification trial, not evidence of general bug-detection accuracy. The repository scan has no independent complete bug ground truth; its scores cannot establish correctness, localization, false-positive rate or cross-file reasoning. High-priority fragments included deliberately broken fixtures and sensitive membership code. A fragment score is not a publishable bug finding.

**Historical status on 2026-10-05: the paired GPT comparison was pending an OpenAI key.** The Cloudflare route below removes that requirement. Existing paired evaluation uses identical original context and therefore adds Jev input rather than reducing GPT input by design. Keep the default advisory switch off until the paired run and semantic review support a default change. The implemented useful placement is inexpensive review prioritization; it never removes source, skips tests or approves a merge.

### Reproduce the trials

With scoped credentials injected privately, run:

```sh
AI_EVAL_LIVE=true node scripts/ai-review/evaluate-jev.mjs
node scripts/ai-review/repository-triage.mjs
AI_EVAL_LIVE=true node scripts/ai-review/evaluate.mjs --live
```

The first command preserves raw typed answers and source hashes for the independent fixtures, with <=10 calls and a $0.02 conservative reservation. The repository command reads a single immutable Git commit, covers supported authored source and configuration including JSONC, records exclusions and file hashes, splits without truncating source lines, and allows <=120 calls with a $0.10 reservation. Three consecutive failures stop inference and produce explicit not-attempted entries for every remaining fragment. Failed calls have unknown billing; reserve is not silently treated as zero. Each fragment receives only its bounded source, so cross-file validation still belongs to GPT/human review with original context and to deterministic tests.

Outputs stay under ignored `ai-review-output/`. Local live reports and raw responses were retained there; no provider credentials were embedded. The local OpenAI entry form stores its key mode 0600 outside Git on the mini and closes after successful submission. It does not activate GitHub secrets or deploy anything.

## Cloudflare primary reviewer — 2026-10-06

Ivan selected Cloudflare for GPT and Jev, with exact model GPT-6 Sol. The workflow fixes `GPT_PROVIDER=cloudflare` and `OPENAI_REVIEW_MODEL=gpt-6-sol`. Account IDs are validated before provider calls. Local tooling retains direct OpenAI support only via explicit `GPT_PROVIDER=openai`; no OpenAI key is injected into the GitHub workflow. Missing credentials, unexpected model identity, incomplete output and invalid evidence produce explicit unavailable/failed/incomplete reports.

Live paired test: 12/12 GPT calls and 6/6 Jev calls completed. Both arms found the five seeded bugs with valid source evidence, returned no findings on the clean refactor, and made no calls for incomplete context. These are deliberately small fixtures, not general accuracy evidence. Both arms receive identical original source; this test demonstrates no Jev detection advantage or token savings. Jev remains optional and disabled by default. Raw responses and reports remain in ignored `ai-review-output/`; GitHub activation still requires scoped credentials and the approved merge.

Billing reference: [Cloudflare unified billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/). ChatGPT/Codex and API balances are separate from Cloudflare credits.

## Architecture comparison pilot — 2026-10-06

See [the experiment report](experiments/2026-10-06-jev-architecture-results.md) for actual-module seeded detection and repair-selection tests. GPT alone and Jev-assisted GPT each identified six seeded issues and preserved both clean controls. Jev missed the directory privacy case at the predefined routing threshold; do not use low-risk scores to skip sensitive review. The small candidate-assisted pilot does not establish full-codebase accuracy or automatic patch reliability.

## Accepted operating policy — 2026-10-06

Ivan accepted the experiment-based recommendation: required deterministic checks for standards and known invariants; GPT-6 Sol via Cloudflare for advisory source-grounded review; Jev restricted to opt-in experiments. Jev cannot skip code, waive checks or authorize changes. Future model-proposed fixes must pass independent regression tests and ordinary project checks before human review. No automatic correction or merge is enabled.

The PR workflow now explicitly disables Jev and removes its credential/configuration injection. Experimental commands remain available for future held-out evaluations. Activation still requires the dedicated Cloudflare inference credential and approval to merge the foundation PR.
