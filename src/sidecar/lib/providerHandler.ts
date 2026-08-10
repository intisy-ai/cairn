import { pathToFileURL } from "node:url";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir } from "@core-auth/index.js";

export interface DeployedHandler {
  repo: string;
  module: Record<string, unknown>;
}

// Imports a deployed provider's handler bundle, throwing a message that names what
// actually went wrong. Every caller used to catch this failure and report its own
// unrelated cause (a provider labelled with its raw id, a missing accounts controller,
// a provider that "does not support in-app login"), which made one broken install look
// like several unrelated bugs.
export async function importProviderHandler(provider: string): Promise<DeployedHandler> {
  const deployed = readDeployedProviders(reposDir()).find((p) => p.provider === provider);
  if (!deployed) throw new Error(`no provider deployed with id: ${provider}`);
  try {
    return { repo: deployed.repo, module: await import(pathToFileURL(deployed.handlerPath).href) };
  } catch (e) {
    throw new Error(`${deployed.repo} failed to load: ${e instanceof Error ? e.message : String(e)}`);
  }
}
