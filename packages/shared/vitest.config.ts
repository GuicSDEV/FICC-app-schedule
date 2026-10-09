import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/schemas/index.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        // Rating and score rules must be fully covered (docs/PHASES.md, Phase 2).
        "src/elo.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/score.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
