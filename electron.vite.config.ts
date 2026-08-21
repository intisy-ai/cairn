import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  main: {
    resolve: {
      alias: {
        // The engine subpath is listed FIRST because a string alias is a prefix match: with only the
        // bare "@intisy-ai/api" entry, an import of "@intisy-ai/api/engine" rewrites to
        // ".../dist/index.js/engine" and fails to load.
        "@intisy-ai/api/engine": fileURLToPath(new URL("./core/node_modules/@intisy-ai/api/generated/engine.js", import.meta.url)),
        "@intisy-ai/api": fileURLToPath(new URL("./core/node_modules/@intisy-ai/api/dist/index.js", import.meta.url)),
        "@intisy-ai/plugin-host": fileURLToPath(new URL("./plugin-host/dist/index.js", import.meta.url)),
        "@core": fileURLToPath(new URL("./core/dist", import.meta.url)),
        "@core-auth": fileURLToPath(new URL("./core-auth/dist", import.meta.url)),
        "@core-loader": fileURLToPath(new URL("./core-loader/dist", import.meta.url)),
        "@core-proxy": fileURLToPath(new URL("./core-proxy/dist", import.meta.url)),
      },
    },
    build: {
      commonjsOptions: {
        // core-loader ships CommonJS (unlike core/core-auth's ESM); it lives outside
        // node_modules via the @core-loader alias, so Rollup's default commonjs
        // handling (node_modules only) must be widened to cover it.
        include: [/node_modules/, /core-loader/],
      },
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
