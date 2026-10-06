import assert from "node:assert/strict";
import process from "node:process";
import { pathToFileURL } from "node:url";
export function requireSuccess(needs, expected = ["checks", "security"]) {
  assert.ok(
    needs && typeof needs === "object" && !Array.isArray(needs),
    "Missing prerequisite results",
  );
  assert.ok(expected.length > 0, "Expected jobs cannot be empty");
  for (const name of expected)
    assert.equal(needs[name]?.result, "success", `${name} did not succeed`);
  for (const [name, job] of Object.entries(needs))
    assert.equal(job?.result, "success", `${name} did not succeed`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  requireSuccess(JSON.parse(process.env.NEEDS || "null"), process.env.EXPECTED_JOBS?.split(","));
}
