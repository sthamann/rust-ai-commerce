/** All executable frontend modules are measured, including files untouched by tests. */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/?shop=unit-shop#merchant" },
    },
    setupFiles: ["tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text-summary", "json", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      reportOnFailure: true,
    },
  },
});
