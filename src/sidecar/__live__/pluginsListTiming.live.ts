import { describe, it } from "vitest";
import { pluginHomes } from "../lib/pluginHomes.js";
import { safeGetPlugins, safeMissingArtifacts } from "../lib/optionalEngines.js";
import { pluginsList } from "../modules/plugins.js";

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const value = await run();
  console.log(`  ${label}: ${Date.now() - start}ms`);
  return value;
}

// Measures the real cost of a plugins:list against this machine's actual homes, so
// the slow phase is identified rather than guessed at.
describe("plugins:list timing", () => {
  it("reports where the time goes", async () => {
    const homes = await timed("pluginHomes()", () => pluginHomes());
    console.log(`  homes: ${homes.map((h) => `${h.id}(present=${h.present})`).join(", ")}`);

    for (const home of homes) {
      if (!home.present) continue;
      const plugins = await timed(`  safeGetPlugins(${home.id})`, () => safeGetPlugins(home.dir));
      console.log(`    plugins: ${plugins.length}`);
      await timed(`  missingArtifacts x${plugins.length} (${home.id})`, async () => {
        for (const p of plugins) await safeMissingArtifacts(home.dir, p.name);
      });
    }

    await timed("pluginsList() total", () => pluginsList());
    await timed("pluginsList() again (warm)", () => pluginsList());
  }, 600000);
});
