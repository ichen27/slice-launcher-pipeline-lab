import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import console from "node:console";
import { pathToFileURL } from "node:url";
export function severeFindings(sarif) {
  assert.equal(sarif.version, "2.1.0", "Expected SARIF 2.1.0");
  assert.ok(Array.isArray(sarif.runs) && sarif.runs.length, "Missing SARIF runs");
  const failures = [];
  for (const run of sarif.runs) {
    assert.ok(Array.isArray(run.results), "Missing scanner results");
    for (const invocation of run.invocations ?? [])
      assert.notEqual(invocation.executionSuccessful, false, "Scanner execution failed");
    for (const finding of run.results) {
      const componentIndex = finding.rule?.toolComponent?.index;
      const components =
        componentIndex === undefined
          ? [run.tool?.driver, ...(run.tool?.extensions ?? [])]
          : [run.tool?.extensions?.[componentIndex]];
      const ruleId = finding.ruleId ?? finding.rule?.id;
      const matches = components
        .flatMap((component) => component?.rules ?? [])
        .filter((rule) => rule.id === ruleId);
      assert.equal(matches.length, 1, "Missing or ambiguous scanner rule metadata");
      const rule = matches[0];
      const severity = Number(rule?.properties?.["security-severity"] ?? 0);
      const level = finding.level ?? rule?.defaultConfiguration?.level;
      if (severity >= 7 || level === "error")
        failures.push({
          rule: finding.ruleId,
          path: finding.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? "unknown",
          severity,
        });
    }
  }
  return failures;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dir = process.argv[2];
  const files = readdirSync(dir).filter((p) => p.endsWith(".sarif"));
  assert.ok(files.length, "Scanner produced no SARIF");
  const failures = files.flatMap((file) =>
    severeFindings(JSON.parse(readFileSync(join(dir, file), "utf8"))),
  );
  if (failures.length) {
    console.error(JSON.stringify(failures));
    process.exitCode = 1;
  } else console.log("No high/critical CodeQL findings.");
}
