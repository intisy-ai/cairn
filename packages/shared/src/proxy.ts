// The local proxy daemon's port and a health probe, shared by the main-process
// daemon, the sidecar, and the renderer so the value and the check live in exactly
// one place rather than being copied per process.
export const PROXY_PORT = 34567;

const PROBE_TIMEOUT_MS = 500;

export async function probeProxyHealth(port: number = PROXY_PORT): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
