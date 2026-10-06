import { test } from "node:test";
import assert from "node:assert/strict";
import { requireSuccess } from "./required-gate.mjs";
test("aggregate requires every expected prerequisite", () => {
  requireSuccess({ checks: { result: "success" }, security: { result: "success" } });
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    assert.throws(() => requireSuccess({ checks: { result }, security: { result: "success" } }));
    assert.throws(() => requireSuccess({ checks: { result: "success" }, security: { result } }));
  }
  assert.throws(() => requireSuccess({}));
  assert.throws(() => requireSuccess(null));
  assert.throws(() => requireSuccess({ checks: { result: "success" } }));
});
