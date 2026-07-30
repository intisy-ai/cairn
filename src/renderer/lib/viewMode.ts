import { cairn } from "./ipc.js";

export type ViewMode = "list" | "grid";

function keyFor(screen: string): string {
  return "viewMode." + screen;
}

export async function loadViewMode(screen: string): Promise<ViewMode> {
  try {
    const result = await cairn.getConfig("cairn", keyFor(screen));
    return result.ok && result.data === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export async function saveViewMode(screen: string, mode: ViewMode): Promise<void> {
  try {
    await cairn.setConfig("cairn", keyFor(screen), mode);
  } catch {
    // preference persistence is best-effort
  }
}
