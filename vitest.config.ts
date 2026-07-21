import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("../../libs/core/dist", import.meta.url)),
      "@core-auth": fileURLToPath(new URL("../../libs/core-auth/dist", import.meta.url)),
      "@core-loader": fileURLToPath(new URL("../../libs/core-loader/dist", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
