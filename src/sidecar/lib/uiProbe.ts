import { execFile } from "node:child_process";

export const UI_DATA_TIMEOUT_MS = 10000;
export const UI_INVOKE_TIMEOUT_MS = 600000;

// The bundle's stdout is its whole answer. A non-zero exit carries the plugin's own stderr,
// which is the only thing that can tell a user why their screen is empty.
export function runUi(bundlePath: string, argv: string[], timeoutMs: number): Promise<unknown> {
  return new Promise((done, fail) => {
    execFile("node", [bundlePath, ...argv], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) { fail(new Error(stderr.trim() || error.message)); return; }
      try {
        done(JSON.parse(stdout.trim()));
      } catch {
        done(null);
      }
    });
  });
}
