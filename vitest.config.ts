import { defineConfig } from "vitest/config";

// Unit tests for pure logic only (no DOM). Separate from vite.config.ts so
// the app build plugins never run during tests.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "cli/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
