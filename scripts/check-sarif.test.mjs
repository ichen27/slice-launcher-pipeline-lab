import { test } from "node:test";
import assert from "node:assert/strict";
import { severeFindings } from "./check-sarif.mjs";
function report(severity, result = { ruleId: "test" }) {
  return {
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: { rules: [{ id: "test", properties: { "security-severity": severity } }] },
        },
        results: [result],
      },
    ],
  };
}
test("high/critical findings block even when a SARIF suppression is present", () => {
  assert.equal(severeFindings(report("7.5")).length, 1);
  assert.equal(
    severeFindings(report("9.8", { ruleId: "test", suppressions: [{ kind: "inSource" }] })).length,
    1,
  );
  assert.equal(severeFindings(report("4.5")).length, 0);
});
test("failed or missing analysis cannot look clean", () => {
  assert.throws(() => severeFindings({ version: "2.1.0", runs: [] }));
  const value = report("0");
  value.runs[0].invocations = [{ executionSuccessful: false }];
  assert.throws(() => severeFindings(value));
});

test("CodeQL extension rule metadata enforces high severity", () => {
  const value = report("8.1");
  const run = value.runs[0];
  run.tool.extensions = [{ name: "codeql/javascript-queries", rules: run.tool.driver.rules }];
  run.tool.driver.rules = [];
  run.results[0].rule = { id: "test", index: 0, toolComponent: { index: 0 } };
  assert.equal(severeFindings(value).length, 1);
});

test("unresolved scanner rules cannot silently pass", () => {
  const value = report("8.1");
  value.runs[0].tool.driver.rules = [];
  assert.throws(() => severeFindings(value), /rule/);
});
