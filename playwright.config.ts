import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
    launchOptions: {
      args: ["--allow-file-access-from-files"],
    },
  },
});
