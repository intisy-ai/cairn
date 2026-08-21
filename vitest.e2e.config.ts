// End-to-end checks: launch the real built Electron app and drive it with Playwright,
// run deliberately rather than in the normal suite (they need out/main built and take minutes).
//   npx vitest run --config vitest.e2e.config.ts
import { defineConfig } from "vitest/config";
import base from "./vitest.config.js";

// `include` is replaced, not merged: mergeConfig concatenates arrays, which would drag
// the whole normal suite into every e2e run.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["src/**/*.e2e.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
