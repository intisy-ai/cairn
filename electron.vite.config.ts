import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@core": fileURLToPath(new URL("../../libs/core/dist", import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
          sidecar: "src/sidecar/index.ts",
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [svelte()],
  },
});
