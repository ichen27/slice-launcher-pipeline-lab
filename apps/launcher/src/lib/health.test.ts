import { expect, it, vi } from "vitest";
import { GET } from "../../app/api/health/route";

it("returns public release identity without cached health data", async () => {
  vi.stubEnv("SLICE_RELEASE_SHA", "a".repeat(40));
  try {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", release: "a".repeat(40) });
  } finally {
    vi.unstubAllEnvs();
  }
});
