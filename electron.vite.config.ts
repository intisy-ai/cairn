import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  main: {
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
