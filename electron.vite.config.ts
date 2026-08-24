import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
          sidecar: "src/sidecar/index.ts",
          installer: "src/installer/index.ts",
        },
        // core-loader's loadUpdater() dynamically imports plugin-updater, a package the
        // dashboard never installs (readDeployedProviders, the only export it uses, does
        // not reach that path); externalizing lets Rollup leave the unreached import as-is.
        external: ["plugin-updater"],
        // Stable (unhashed) chunk names for the main-process bundles: a rebuild's chunk hash
        // changing orphaned a file a still-running app pointed at ("Cannot find module") for
        // locally-bundled dynamic imports like ./plugins.js. A fixed name means a rebuilt chunk
        // keeps the same path.
        output: {
          chunkFileNames: "chunks/[name].js",
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [svelte()],
  },
});
