import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.pw.ts",
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:4539", permissions: ["clipboard-read", "clipboard-write"], trace: "retain-on-failure" },
  webServer: { command: "npm run preview -- --host 127.0.0.1 --port 4539 --strictPort", url: "http://127.0.0.1:4539", reuseExistingServer: !process.env.CI },
});
