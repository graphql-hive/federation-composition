import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "__tests__/**/*.spec.ts"],
    setupFiles: ["./__tests__/shared/setup.ts"],
  },
});
