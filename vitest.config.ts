import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : [],
  },
  test: {
    // The default "forks" pool crashes serializing IPC results back to the parent, which
    // always exits non-zero even when every test passed.
    pool: "threads",
    include: ["src/**/*.test.ts", "vendor/**/*.test.ts", "packages/shared/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // The sidecar tests import real bundles and build real homes on disk, which takes a few
    // seconds each. Against the 5s default they passed alone and timed out under parallel
    // load, which reads as a flaky suite rather than as slow tests.
    testTimeout: 30000,
  },
});
