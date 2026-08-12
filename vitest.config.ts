import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : [],
    alias: {
      "@core": fileURLToPath(new URL("./core/dist", import.meta.url)),
      "@core-auth": fileURLToPath(new URL("./core-auth/dist", import.meta.url)),
      "@core-loader": fileURLToPath(new URL("./core-loader/dist", import.meta.url)),
      "@core-proxy": fileURLToPath(new URL("./core-proxy/dist", import.meta.url)),
      "@config-ledger": fileURLToPath(new URL("../../plugins/config-ledger/dist", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "vendor/**/*.test.ts", "packages/shared/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // The sidecar tests import real bundles and build real homes on disk, which takes a few
    // seconds each. Against the 5s default they passed alone and timed out under parallel
    // load, which reads as a flaky suite rather than as slow tests.
    testTimeout: 30000,
  },
});
