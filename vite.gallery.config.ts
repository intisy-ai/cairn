import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

// The gallery is a dev-only entry: real components and real app.css, no sidecar and no IPC.
// It is deliberately absent from electron.vite.config.ts so it can never reach a shipped build.
export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer/gallery", import.meta.url)),
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: fileURLToPath(new URL("./out/gallery", import.meta.url)),
    emptyOutDir: true,
  },
});
