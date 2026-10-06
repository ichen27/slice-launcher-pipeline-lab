# Jev and GPT architecture pilot — 2026-10-06

## Decision

Keep deterministic code-quality checks required and GPT-6 Sol as the evidence-producing reviewer. Keep Jev optional for prioritization. Do not use its low-risk score to skip review of sensitive code or authorize automatic edits.

This pilot found no detection or repair advantage from Jev annotations. A derived filtering policy saved projected model cost by skipping a real seeded privacy defect. These results apply only to this small constructed dataset.

## Method

Source snapshot: `227aaa15c46eef7ab8f9d678109daacc7828da9a`. Three full, related production modules: membership domain, membership contracts and app registry/URL validation, with the actual architecture standards. Vendored source matches that commit, so shallow CI checkouts can reproduce the tests.

Eight opaque cases: six seeded issues (inactive access, deny precedence, identity rebinding, private directory fields, insecure app URLs, production import of tests) and two clean changes (equivalent condition and an untrusted source comment). The original source and change are identical between GPT arms. Test expectations are withheld. Candidate alternatives are neutral-ID, stable-shuffled keep/reversal/over-restrictive edits.

**This is candidate-assisted detection and bounded repair selection.** The models can see the edit alternatives, including a reversal; that makes it easier than blind discovery and unrestricted patch generation. This is neither a full-repository scan nor held-out real-PR evidence.

The independent oracle checks active/denied access, unknown permissions, private directory projection, conflicting/legitimate identities, permitted/rejected URLs and the actual architecture checker. Every seeded case fails its intended check, every case has a passing repair, and each over-restrictive alternative breaks permitted behavior. Only fixed, authored candidate source executes; model-generated code never executes.

Provider models: Cloudflare `openai/gpt-6-sol`, reasoning low, 2,048 output-token limit; Jev `jev-1.13.0`. One fresh Jev and two fresh GPT calls per case, counterbalanced GPT order. No retries. Explicit per-file probabilities use the entire three-module context. The derived routing policy uses threshold 0.5; it reuses the assisted outputs for modeling outcomes and is **not a separately executed latency trial**.

## Results from the explicit-evidence run

| Architecture                    | Seeded issues identified | Clean cases classified correctly | Passing repair selected for identified bugs | Unnecessary clean edits | Estimated standalone cost, all 8 cases |
| ------------------------------- | ------------------------ | -------------------------------- | ------------------------------------------- | ----------------------- | -------------------------------------- |
| Jev only                        | 5/6                      | 2/2                              | 5/5                                         | 2                       | $0.001592                              |
| GPT alone                       | 6/6                      | 2/2                              | 6/6                                         | 0                       | $0.079254                              |
| Jev signals + GPT               | 6/6                      | 2/2                              | 6/6                                         | 0                       | $0.081680                              |
| Jev filters GPT calls (derived) | 5/6                      | 2/2                              | 5/5                                         | 0                       | $0.052164 projected                    |

Jev selected the technically correct reversal for the privacy bug but gave its highest defect probability **0.45**, below the predeclared 0.5 routing threshold. The derived policy would therefore skip GPT on that case. Both GPT arms independently identified that spreading the private Member object into directory results exposes email, subject and access settings; both selected the passing repair. The same Jev run classified both controls as clean but chose unnecessary reversals. Classification and correction choices need consistency checks.

I inspected both GPT arms' explanations against source and the oracle: each accepted finding describes the intended introduced failure with matching evidence. This is one maintainer/agent semantic assessment, not a blinded multi-reviewer assessment. No supplied regression check failed after the selected GPT repairs; that does not establish absence of every possible regression.

| Measured usage                | Input tokens | Output tokens | Sum of provider request time |
| ----------------------------- | ------------ | ------------- | ---------------------------- |
| Jev, 8 calls                  | 37,915       | 921           | 2.819 s                      |
| GPT alone, 8 calls            | 34,882       | 949           | 26.568 s                     |
| GPT with annotations, 8 calls | 36,464       | 716           | 20.245 s                     |

The assisted standalone architecture adds Jev time and cost to its GPT row. The 3.1% higher estimated cost yielded the same detections; GPT input rose 4.5%. This run cannot establish a latency benefit: there is one sample per case and provider conditions vary. No statistical significance or general accuracy claim.

Costs use published short-context uncached rates of $2/M input and $10/M output for GPT, and $0.042/M input for Jev. They exclude cache discounts and Cloudflare's 5% credit-purchase fee, and are not invoices. [GPT pricing](https://developers.cloudflare.com/ai/models/openai/gpt-6-sol/), [Jev models](https://docs.typesafe.ai/models), [Cloudflare billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/).

## Preserved failed calibration run

The first run used ambiguous wording, asking for evidence without explicitly requiring verbatim contiguous source. Nine of sixteen GPT responses paraphrased evidence, so strict validation rejected them (GPT alone 4/8 accepted, assisted 3/8 accepted). This was a prompt-contract failure, not nine demonstrated reasoning failures. Raw responses were retained.

The prompt was corrected to require exact source substrings; the validator was not weakened. All eight cases and both arms were rerun, not only failures. The second run accepted all 16 GPT outputs. This is prompt calibration, not an independent replication or held-out validation.

Initial trial estimated cost: $0.159266. Corrected trial: $0.160934. Total spent-token estimate: **$0.320201**, or about **$0.336211** allocating the 5% credit-purchase fee. Preflight reservations were $2.267254 and $2.286374, totaling $4.553629 under the initial $5 experiment allowance. There were 48 provider calls across both runs.

## Where each component currently fits

- **Deterministic checks:** enforce formatting, types, import boundaries and executable behavioral invariants. The experiment oracle adds known-bug checks; it is not evidence that existing production CI catches every seeded defect.
- **Jev:** optional cheap risk annotation or prioritization across related source groups; never a sole correctness decision. Test its routing against a held-out set before relying on exclusions.
- **GPT:** inspect original source, explain supported defects and choose or propose focused corrections. Jev annotations remain untrusted advice.
- **Repair validation:** run focused regression tests plus ordinary project checks, independently of either model's confidence. No automatic merge or production changes.

## Next experiment before promoting a model policy

1. Freeze prompts/thresholds, then assemble at least 30 problematic and 30 clean changes that were not used in calibration. Include historical PRs, multi-file defects, migrations, CI trust boundaries, ambiguous cases and realistic distractors. An independent reviewer supplies labels.
2. Compare blind GPT review, Jev-annotated GPT, and dependency-aware retrieval. Models should not see repair alternatives until detection is recorded. Give each architecture the same repository access and account for retrieval coverage explicitly.
3. Repeat in randomized order at equal budget; report critical misses, precision/recall, invalid outputs, uncertainty, latency distribution and cost per confirmed detection. Missing/failed runs stay in denominators.
4. Test unrestricted patch generation in disposable, credential-free sandboxes with resource/network controls. Keep hidden regression tests and require unchanged legitimate behavior, typecheck, lint and architecture checks.
5. Promote only if the added architecture improves independently confirmed outcomes at acceptable cost, with no critical-miss regression. Keep controls required regardless of model results.

## Reproduce and inspect

Tests: `node --test scripts/ai-architecture.test.mjs`. Live runner: import `runExperiment` from `scripts/ai-review/architecture-lab.mjs` and pass repository, `configFromEnv` Cloudflare credentials and a private output directory. Live execution is opt-in through the caller; ordinary CI only runs local fixture tests. A private local wrapper used Wrangler credentials in memory; no credentials are in the report.

Ignored local reports:

- `ai-review-output/architecture-2026-10-06/report.json`
- `ai-review-output/architecture-2026-10-06-explicit-evidence/report.json`

Reports include source commit, per-case source hashes, exact harness and lockfile hashes, raw answers, costs, provider request time separately from total stage time, and failures. Three consecutive failures halt later calls and record explicit not-attempted outcomes. Unknown provider charges are null, not zero. Source hashes and file content are available in the vendored snapshot.

No runtime application files were changed. Integration remains in draft PR #11; this experiment does not approve merge, production deployment, or model-secret activation.
