import { join } from "node:path";
import { buildRepo, deployBundle, fetchRepo, materializeLibraries, repoHead } from "@intisy-ai/core";
import { hasCapability, invokePluginManagement, PLUGIN_MANAGEMENT } from "./pluginManager.js";
import { pluginDir, reposDir } from "./storagePaths.js";

/** Told at each phase boundary so a host can show live progress; percent is coarse, 0..100. */
export type ProgressReport = (step: string, percent: number) => void;

/**
 * Fetches, builds and deploys a plugin repository into a home without asking a manager.
 *
 * @remarks
 * Only ever the manager's OWN first install. A home with no manager has nothing that could answer
 * `plugin-management`, so this is what breaks the deadlock; everything afterwards, that plugin
 * included, goes through the capability it then provides.
 */
export async function bootstrapPluginRepo(homeDir: string, id: string, url: string, report?: ProgressReport): Promise<void> {
  const repos = reposDir(homeDir);
  report?.("Downloading", 20);
  if (!fetchRepo(repos, id, url, { progress: true, log: console.error }).ok) {
    throw new Error(`could not fetch ${id} from ${url}`);
  }

  const source = join(repos, id);
  report?.("Building", 50);
  buildRepo(id, source, { log: console.error });

  report?.("Deploying", 80);
  // A bundle imports the libraries it carries by NAME rather than inlining them, so a home whose
  // store has not been filled cannot load what was just deployed.
  materializeLibraries(source, homeDir, console.error);
  const deployed = await deployBundle(source, pluginDir(homeDir), id, { head: repoHead(source), log: console.error });
  if (!deployed.ok) throw new Error(`${id} built nothing this home can load`);
}

/**
 * Puts a plugin into a home, through its manager wherever one answers.
 *
 * @remarks
 * The bootstrap is the exception, not the route: asking the home first means a manager's own
 * upgrade, and every plugin after it, is carried out by the thing that owns plugin installation
 * rather than by a second implementation here.
 */
export async function installPluginRepo(homeDir: string, id: string, url: string, appId: string, report?: ProgressReport): Promise<void> {
  if (!(await hasCapability(homeDir, appId, PLUGIN_MANAGEMENT))) {
    await bootstrapPluginRepo(homeDir, id, url, report);
    return;
  }
  const outcome = await invokePluginManagement(homeDir, appId, "install", null, (capability) => capability.install(url));
  if (!outcome) throw new Error(`nothing manages the plugins of ${appId}`);
  if (!outcome.ok) throw new Error(outcome.message || `could not install ${id}`);
}
