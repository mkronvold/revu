import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["../../tests/api/**/*.test.ts"],
    // Each test file calls resetDemoData() on a shared DB; run files one at a time
    // to avoid concurrent TRUNCATE deadlocks and cross-file session invalidation.
    fileParallelism: false,
  },
});
