import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for NextGenPricing2.
 *
 * Mirrors the path aliases from `tsconfig.json` and `vite.config.js` so test
 * files can `import` from `@/` and `@shared/` the same way client and server
 * code does.
 *
 * Test layout:
 *   tests/calc-parity/   — golden-snapshot tests for the pricing engine
 *   tests/domain/        — unit tests for domain models (Phase 1.4 onward)
 *   tests/integration/   — supertest integration tests against booted server
 *   tests/assembly/      — assembly expansion engine tests (Phase 1.2)
 *   tests/batch/         — batch renewal tests (Phase 1.3)
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".smoke-logs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/**",
        "tests/**",
        "scripts/**",
        "client/**",
        "**/*.config.{js,ts}",
      ],
    },
    // The calc-parity tests in particular need real DB access; allow a
    // generous timeout for the first run that may push schema + seed.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@dealpad/domain": path.resolve(__dirname, "./packages/domain/src/index.ts"),
      "@dealpad/application": path.resolve(__dirname, "./packages/application/src/index.ts"),
      "@dealpad/infrastructure": path.resolve(__dirname, "./packages/infrastructure/src/index.ts"),
    },
  },
});
