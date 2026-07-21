import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : [],
    alias: {
      "@core": fileURLToPath(new URL("../../libs/core/dist", import.meta.url)),
      "@core-auth": fileURLToPath(new URL("../../libs/core-auth/dist", import.meta.url)),
      "@core-loader": fileURLToPath(new URL("../../libs/core-loader/dist", import.meta.url)),
      "@core-proxy": fileURLToPath(new URL("../../libs/core-proxy/dist", import.meta.url)),
      "@claude-code-proxy": fileURLToPath(new URL("../../libs/claude-code-proxy/dist", import.meta.url)),
      "@plugin-updater": fileURLToPath(new URL("../../tools/plugin-updater/dist", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "vendor/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
