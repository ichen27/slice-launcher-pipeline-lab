import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import {
  LIMITS,
  MARKER,
  boundedJson,
  emptyReport,
  exactKeys,
  parsePatch,
  renderComment,
  safePath,
  sha,
  text,
  validateFindings,
} from "./core.mjs";

export function githubApi(repository, token, fetcher = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid repository");
  let calls = 0;
  return async (path, options = {}) => {
    if (++calls > 220 || !path.startsWith("/") || path.includes("..") || path.includes("#"))
      throw new Error("GitHub request bound");
    return boundedJson(
      await fetcher("https://api.github.com/repos/" + repository + path, {
        method: options.method || "GET",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(15000),
      }),
      2000000,
    );
  };
}

export function validateTarget(target) {
  sha(target.base);
  sha(target.head);
  if (
    !Number.isSafeInteger(target.pr) ||
    target.pr < 1 ||
    !/^[\w.-]+\/[\w.-]+$/.test(target.repository)
  )
    throw new Error("Invalid target");
}
function currentMatches(pr, target) {
  return (
    pr.state === "open" &&
    pr.number === target.pr &&
    pr.base.ref === "main" &&
    pr.base.repo.full_name === target.repository &&
    pr.base.sha === target.base &&
    pr.head.sha === target.head
  );
}

export async function collectContext(api, target, standards) {
  validateTarget(target);
  const context = {
    base: target.base,
    head: target.head,
    mergeBase: target.base,
    pr: target.pr,
    description: "",
    complete: true,
    omissions: [],
    files: [],
    surrounding: [],
    checks: [],
    standards: text(standards, 30000),
  };
  const omit = (reason) => {
    context.complete = false;
    context.omissions.push(reason);
  };
  const pr = await api("/pulls/" + target.pr);
  if (!currentMatches(pr, target)) {
    omit("PR closed, base changed, or head superseded.");
    return context;
  }
  if (Buffer.byteLength(pr.body || "") > 10000) {
    omit("PR description exceeds bound.");
    return context;
  }
  context.description = pr.body || "";
  const comparison = await api("/compare/" + target.base + "..." + target.head);
  context.mergeBase = sha(comparison.merge_base_commit.sha);
  if (context.mergeBase !== target.base) {
    omit("Update branch against current base before exact-base review.");
    return context;
  }
  if (
    !Array.isArray(comparison.files) ||
    comparison.files.length !== pr.changed_files ||
    comparison.files.length > 40
  ) {
    omit("Changed-file enumeration exceeds bound or is inconsistent.");
    return context;
  }
  const trees = {};
  for (const ref of [target.base, target.head]) {
    const tree = await api("/git/trees/" + ref + "?recursive=1");
    if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length > 10000) {
      omit("Repository tree is incomplete.");
      return context;
    }
    trees[ref] = new Map(
      tree.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry]),
    );
  }
  let bytes = 0,
    loaded = 0;
  const cache = new Map();
  const source = async (path, ref) => {
    safePath(path);
    if (/(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$/i.test(path)) {
      omit("Sensitive path excluded.");
      return null;
    }
    const entry = trees[ref].get(path);
    if (!entry) {
      omit("Expected source missing from tree.");
      return null;
    }
    if (!["100644", "100755"].includes(entry.mode) || entry.size > 100000) {
      omit("Unsupported source type or size.");
      return null;
    }
    if (cache.has(entry.sha)) return cache.get(entry.sha);
    if (++loaded > LIMITS.files) {
      omit("Source-file budget exceeded.");
      return null;
    }
    const blob = await api("/git/blobs/" + sha(entry.sha));
    if (blob.encoding !== "base64" || blob.size > 100000) {
      omit("Unsupported blob encoding or size.");
      return null;
    }
    const buffer = Buffer.from(blob.content, "base64");
    bytes += buffer.byteLength;
    if (bytes > LIMITS.inputBytes || buffer.byteLength !== blob.size || buffer.includes(0)) {
      omit("Source bytes exceed budget, are inconsistent, or binary.");
      return null;
    }
    let value;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      omit("Source is not UTF-8.");
      return null;
    }
    cache.set(entry.sha, value);
    return value;
  };
  for (const changed of comparison.files) {
    safePath(changed.filename);
    if (changed.status === "renamed") {
      omit("Rename review requires previous-path context; human review required.");
      continue;
    }
    try {
      const lines = parsePatch(changed.patch);
      if (lines.right.size !== changed.additions || lines.left.size !== changed.deletions)
        throw new Error("Omitted patch rows");
    } catch {
      omit("Missing or truncated patch; binary/rename-only changes require human review.");
      continue;
    }
    const before =
      changed.status === "added"
        ? ""
        : await source(changed.previous_filename || changed.filename, target.base);
    const after = changed.status === "removed" ? "" : await source(changed.filename, target.head);
    context.files.push({
      path: changed.filename,
      status: changed.status,
      patch: changed.patch,
      base: before,
      head: after,
    });
  }
  // Deliberately broad deterministic scope, no model-selected pruning or contributor code execution.
  // Include all textual files in touched apps and shared packages, plus tooling for tooling changes.
  const apps = new Set(
    context.files.map((file) => /^apps\/([^/]+)\//.exec(file.path)?.[1]).filter(Boolean),
  );
  const tooling = context.files.some((file) => /^(scripts\/|\.github\/)/.test(file.path));
  const changedPaths = new Set(context.files.map((file) => file.path));
  for (const path of [...trees[target.head].keys()].sort()) {
    if (changedPaths.has(path)) continue;
    const app = /^apps\/([^/]+)\//.exec(path)?.[1];
    const relevant =
      apps.has(app) ||
      path.startsWith("packages/") ||
      (tooling && /^(scripts\/|\.github\/)/.test(path)) ||
      ["package.json", "pnpm-workspace.yaml"].includes(path);
    if (
      !relevant ||
      !/\.(?:[cm]?[jt]sx?|jsonc?|ya?ml|sql|md|css)$/.test(path) ||
      /(?:worker-configuration\.d\.ts|pnpm-lock\.yaml)$/.test(path)
    )
      continue;
    const value = await source(path, target.head);
    if (value !== null) context.surrounding.push({ path, ref: target.head, content: value });
    if (loaded > LIMITS.files || bytes > LIMITS.inputBytes) break;
  }
  for (const ref of [...new Set([target.head, pr.merge_commit_sha].filter(Boolean))]) {
    sha(ref);
    const checks = await api("/commits/" + ref + "/check-runs?per_page=100");
    if (checks.total_count > 100) omit("Check results exceed bound.");
    context.checks.push(
      ...checks.check_runs.map((check) => ({
        sha: ref,
        name: String(check.name).slice(0, 150),
        status: check.status,
        conclusion: check.conclusion,
      })),
    );
  }
  if (Buffer.byteLength(JSON.stringify(context)) > LIMITS.inputBytes)
    omit("Serialized context exceeds request budget.");
  if (!currentMatches(await api("/pulls/" + target.pr), target))
    omit("PR changed during source collection.");
  return context;
}

export function validateReport(report) {
  exactKeys(report, [
    "version",
    "reservedUsd",
    "base",
    "head",
    "status",
    "reason",
    "findings",
    "gpt",
    "jev",
  ]);
  if (
    !Number.isFinite(report.reservedUsd) ||
    report.reservedUsd < 0 ||
    report.reservedUsd > LIMITS.maxUsd
  )
    throw new Error("Invalid reserved cost bound");
  sha(report.base);
  sha(report.head);
  text(report.reason, 400);
  if (
    report.version !== 1 ||
    !["completed", "incomplete", "failed", "unavailable", "pending"].includes(report.status) ||
    !Array.isArray(report.findings) ||
    report.findings.length > 8
  )
    throw new Error("Invalid report envelope");
  if (!["completed", "incomplete"].includes(report.status) && report.findings.length)
    throw new Error("Findings on unsuccessful report");
  for (const finding of report.findings) {
    exactKeys(finding, [
      "path",
      "side",
      "start",
      "end",
      "severity",
      "title",
      "explanation",
      "evidence",
    ]);
    safePath(finding.path);
    if (
      !["LEFT", "RIGHT"].includes(finding.side) ||
      !["critical", "high", "medium", "low"].includes(finding.severity) ||
      !Number.isSafeInteger(finding.start) ||
      !Number.isSafeInteger(finding.end) ||
      finding.start < 1 ||
      finding.end < finding.start ||
      finding.end - finding.start > 10
    )
      throw new Error("Invalid finding structure");
    text(finding.title, 120);
    text(finding.explanation, 1000);
    text(finding.evidence, 500);
  }
  for (const provider of [report.gpt, report.jev]) {
    exactKeys(provider, [
      "status",
      "model",
      "inputTokens",
      "outputTokens",
      "estimatedUsd",
      "latencyMs",
    ]);
    if (!["completed", "incomplete", "failed", "unavailable", "disabled"].includes(provider.status))
      throw new Error("Invalid provider status");
    text(provider.model, 100);
    for (const key of ["inputTokens", "outputTokens", "latencyMs"])
      if (!Number.isSafeInteger(provider[key]) || provider[key] < 0 || provider[key] > 10000000)
        throw new Error("Invalid usage metadata");
    if (
      provider.estimatedUsd !== null &&
      (!Number.isFinite(provider.estimatedUsd) ||
        provider.estimatedUsd < 0 ||
        provider.estimatedUsd > 100)
    )
      throw new Error("Invalid cost metadata");
  }
  return report;
}

export async function publish(api, target, report) {
  validateTarget(target);
  validateReport(report);
  if (report.head !== target.head || report.base !== target.base)
    throw new Error("Artifact commit mismatch");
  const pr = await api("/pulls/" + target.pr);
  if (pr.base.ref !== "main" || pr.base.repo.full_name !== target.repository || pr.state !== "open")
    throw new Error("Publication target changed");
  // Re-collect and validate findings at the write boundary. No provider keys in this job.
  if (report.findings.length && currentMatches(pr, target)) {
    const context = await collectContext(api, target, "");
    if (!context.complete)
      report = {
        ...emptyReport(
          target,
          "incomplete",
          "Publication could not revalidate the complete source context.",
        ),
        gpt: report.gpt,
        jev: report.jev,
      };
    else validateFindings({ status: report.status, findings: report.findings }, context);
  }
  const comments = [];
  for (let page = 1; page <= 5; page++) {
    const items = await api("/issues/" + target.pr + "/comments?per_page=100&page=" + page);
    comments.push(...items);
    if (items.length < 100) break;
    if (page === 5)
      throw new Error("Comment enumeration incomplete; refusing duplicate publication");
  }
  const existing = comments.filter(
    (comment) => comment.user.login === "github-actions[bot]" && comment.body.startsWith(MARKER),
  );
  if (existing.length > 1) throw new Error("Duplicate reviewer markers require maintainer cleanup");
  const latest = await api("/pulls/" + target.pr);
  // Explicit SHA and this final check make any later racing push visibly out-of-scope.
  const body = renderComment(report, latest.head.sha, target.repository, latest.base.sha);
  if (Buffer.byteLength(body) > 18000) throw new Error("Comment too large");
  return api(
    existing.length ? "/issues/comments/" + existing[0].id : "/issues/" + target.pr + "/comments",
    { method: existing.length ? "PATCH" : "POST", body: { body } },
  );
}
