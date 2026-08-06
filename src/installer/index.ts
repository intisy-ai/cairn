// Runs ONE plugin job, in its own process, then exits. plugin-updater does its git, npm and
// deploy work with execSync, so running it anywhere else would stop the sidecar answering.
// Must be set before plugin-updater is imported: its entry activates itself otherwise.
process.env.PLUGIN_UPDATER_LIBRARY_MODE = "1";

export interface JobMessage {
  jobId: string;
  kind: "install" | "update" | "remove";
  plugin: string;
  url: string;
  home: string;
  homeDir: string;
  isPluginManager: boolean;
  autoUpdate: boolean;
}

function report(jobId: string, phase: string, percent: number): void {
  process.send?.({ jobId, phase, percent });
}

async function run(job: JobMessage): Promise<void> {
  const [env, index, config, init] = await Promise.all([
    import("@plugin-updater/env.js"),
    import("@plugin-updater/index.js"),
    import("@plugin-updater/config.js"),
    import("@plugin-updater/init.js"),
  ]);
  env.setEarlyLaunchConfigDir(job.homeDir);

  if (job.kind === "remove") {
    report(job.jobId, "removing", 50);
    index.uninstallPlugin(job.homeDir, job.plugin);
    return;
  }

  report(job.jobId, "downloading", 10);
  await index.updatePluginPublic(job.plugin, job.url);
  report(job.jobId, "registering", 80);
  config.registerPlugin(job.homeDir, job.plugin, job.url, job.autoUpdate);

  // An app loads the manager through its own config, so a clone alone would leave a manager
  // that is installed but never runs.
  if (job.isPluginManager && job.home !== "cairn") {
    report(job.jobId, "registering with the app", 90);
    init.registerUpdaterWithApp(job.homeDir, job.home);
  }

  await recordInstalledVersion(job);
}

// The update badge is read from this home's cache, so an install that does not write it leaves
// the plugin looking behind forever. Done here because this is where the fresh clone is.
async function recordInstalledVersion(job: JobMessage): Promise<void> {
  try {
    const [cacheModule, git] = await Promise.all([import("@plugin-updater/cache.js"), import("@plugin-updater/git.js")]);
    const head = git.getLocalHead(job.plugin);
    if (!head) return;
    const cache = cacheModule.readUpdateCache(job.homeDir);
    const previous = cache.plugins[job.plugin];
    cache.checkedAt = new Date().toISOString();
    cache.plugins[job.plugin] = {
      kind: "git",
      installedVersion: previous?.installedVersion ?? null,
      localHead: head,
      remoteHead: head,
      latestVersion: previous?.latestVersion ?? null,
      updateAvailable: false,
      updatedAt: cache.checkedAt,
    };
    cacheModule.writeUpdateCache(job.homeDir, cache);
  } catch { /* a stale badge is not worth failing a finished install over */ }
}

process.on("message", (raw: unknown) => {
  const job = raw as JobMessage;
  run(job)
    .then(() => {
      process.send?.({ jobId: job.jobId, done: true });
      process.exit(0);
    })
    .catch((error: unknown) => {
      process.send?.({ jobId: job.jobId, error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    });
});
