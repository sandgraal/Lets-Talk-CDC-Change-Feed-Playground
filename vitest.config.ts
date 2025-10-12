import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
