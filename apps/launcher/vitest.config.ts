import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/membership/{auth,api,domain,repository,contracts}.ts"],
      reporter: ["text", "json-summary", "html"],
      // Per-module floors from measured authorization scenarios; see docs/testing.md.
      thresholds: {
        "src/membership/auth.ts": { statements: 88, branches: 90, functions: 100, lines: 87 },
        "src/membership/api.ts": { statements: 94, branches: 86, functions: 100, lines: 93 },
        "src/membership/domain.ts": { statements: 99, branches: 94, functions: 100, lines: 99 },
        "src/membership/repository.ts": {
          statements: 96,
          branches: 91,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
