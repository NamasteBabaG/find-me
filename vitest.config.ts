import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "content/**/*.test.ts"],
    environment: "node",
    // The pipeline tests seed and generate whole games against a real SQLite
    // file; on their own most take 3-7 s, and in the parallel suite a few
    // crossed the 5 s default and failed as timeouts without anything being wrong.
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
