import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, pathToFileURL } from "node:url";

// The alias-resolved dist paths for the two optional engines (see optionalEngines.ts):
// externalizing them (below) leaves their absolute filesystem path as the literal
// dynamic-import() specifier in the emitted bundle. On Windows that path is
// "F:\...\dist\config.js": Node's ESM loader parses the drive letter as a URL scheme
// and rejects it (ERR_UNSUPPORTED_ESM_URL_SCHEME), so the import always fails even
// when the engine is present. `output.paths` rewrites those two ids to real file://
// URLs, which Node resolves correctly on every platform.
const OPTIONAL_ENGINE_EXTERNAL = [/[\\/]tools[\\/]plugin-updater[\\/]dist[\\/]/, /[\\/]plugins[\\/]config-ledger[\\/]dist[\\/]/];

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@core": fileURLToPath(new URL("../../libs/core/dist", import.meta.url)),
        "@core-auth": fileURLToPath(new URL("../../libs/core-auth/dist", import.meta.url)),
        "@core-loader": fileURLToPath(new URL("../../libs/core-loader/dist", import.meta.url)),
        "@core-proxy": fileURLToPath(new URL("../../libs/core-proxy/dist", import.meta.url)),
        "@claude-code-proxy": fileURLToPath(new URL("../../proxies/claude-code-proxy/dist", import.meta.url)),
        "@opencode-proxy": fileURLToPath(new URL("../../proxies/opencode-proxy/dist", import.meta.url)),
        "@plugin-updater": fileURLToPath(new URL("../../tools/plugin-updater/dist", import.meta.url)),
        "@config-ledger": fileURLToPath(new URL("../../plugins/config-ledger/dist", import.meta.url)),
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
        //
        // plugin-updater and config-ledger are OPTIONAL engine plugins (see optionalEngines.ts):
        // Cairn must build even when their sibling repos are not checked out. Externalizing the
        // aliased dist paths stops Rollup from reading their files at build time (it would
        // otherwise ENOENT on a missing repo); the sidecar resolves the alias-substituted path
        // itself at runtime through a presence-probed dynamic import(), so a build with both
        // engines present behaves exactly as before.
        external: ["plugin-updater", ...OPTIONAL_ENGINE_EXTERNAL],
        // Stable (unhashed) chunk names for the main-process bundles: a rebuild's chunk hash
        // changing orphaned a file a still-running app pointed at ("Cannot find module") for
        // locally-bundled dynamic imports like ./plugins.js. A fixed name means a rebuilt chunk
        // keeps the same path.
        output: {
          chunkFileNames: "chunks/[name].js",
          paths: (id) => (OPTIONAL_ENGINE_EXTERNAL.some((re) => re.test(id)) ? pathToFileURL(id).href : id),
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [svelte()],
  },
});
