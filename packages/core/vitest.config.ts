import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["test/model/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // EditContext は Chromium にしか実装がない
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
