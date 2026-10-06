# Slice Jev/GPT architecture experiment

2026-10-06. Requested by Ivan. Worktree: slice-launcher-cicd, feat/cicd-ai-review.

## Hypothesis and scope

Test whether typed Jev decisions improve GPT-6 Sol review and bounded repair selection on actual Slice code groups. This is an initial seeded-mutation pilot, not full-repository correctness certification. All source is pinned to a Git commit. No production changes or automated merge.

## Arms

- Jev only: per-file defect probabilities and choice among fixed repair candidates.
- GPT alone: original code, change, standards and the same candidate edits.
- GPT + Jev: identical context plus untrusted source-linked Jev signals.
- Routed policy (derived): use assisted output only when max Jev risk >= 0.5; measure missed issues and projected calls. Not a separately executed latency trial.

## Dataset and oracle

Eight opaque-ID cases from actual membership/domain/contracts and app URL modules: six seeded issues and two clean controls. Full related module source is provided; tests/labels are withheld. Repair alternatives have neutral stable-shuffled IDs: keep, specific edit reversal, and over-restrictive behavior. Only pre-authored candidate source can execute in the oracle; no generated code, commands or paths.
Tests cover denial and permitted behavior, identity conflicts, directory privacy, URL schemes/credentials and the actual architecture checker. Verify clean baseline, mutant failures and repair success before model calls.

## Measurements

Detection TP/FN/FP/TN, unavailable/invalid separately, source evidence, correct clean decisions, bounded repair pass rate and regression failures, per-model tokens, estimated cost, request time, hashes and raw outputs. Location/evidence matches are candidates until semantic inspection. One pass; no statistical superiority claims. Candidate selection is easier than unrestricted patch generation.

## Limits and trust

Exact Cloudflare models only; source is untrusted prompt data; no tools, redirects or retries. 90-second calls; 2,048 GPT output tokens; bounded responses; reserve input by UTF-8 bytes and highest published model rates; <=$5 total. Credentials passed in memory by a private local wrapper. Reports ignored. No model keys in Git or model state.

## Steps

1. Build immutable source fixture generator and independent executable oracle.
2. Test mutated/clean/repair controls; test answer validation and cost preflight.
3. Run preflight, then the live bounded experiment and retain every outcome.
4. Inspect findings semantically; publish an evidence-based report and recommendation in draft PR #11 and Obsidian.
5. Later validation: larger held-out real PRs, multi-file bugs, repeated randomized trials, and unrestricted generated patches only in a disposable sandbox with separate secret-free execution.
