// Live checks: real clones against throwaway homes, run deliberately rather than in the
// normal suite (they need the network and take minutes).
//   npx vitest run --config vitest.live.config.ts
import { defineConfig } from "vitest/config";
import base from "./vitest.config.js";

// `include` is replaced, not merged: mergeConfig concatenates arrays, which would drag
// the whole normal suite into every live run.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["src/**/*.live.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
