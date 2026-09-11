import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig の "@/*" -> "./src/*" と同じ解決をテスト実行時にも効かせる
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["tests/setup.ts"],
  },
});
