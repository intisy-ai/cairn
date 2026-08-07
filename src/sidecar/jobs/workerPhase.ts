// Reads the plugin manager's own progress off a worker's stderr. A job's coarse phases come
// from the worker itself and jump straight from the git fetch to registering, which left an
// update sitting at one percentage for the whole npm install and build. The manager already
// says what it is doing in its log; mirroring that to stderr and reading it here is what makes
// those minutes legible.
//
// Matching is on the shape of the manager's log lines, not on any plugin or app name.

export interface WorkerPhase {
  phase: string;
  percent: number;
}

type Stage = { pattern: RegExp; phase: string; percent: number };

// Ordered: the first pattern that matches a line wins, and later stages carry higher
// percentages so the bar only ever moves forward (the job model clamps it monotonically).
const STAGES: Stage[] = [
  { pattern: /\bRunning npm install\b/i, phase: "installing dependencies", percent: 30 },
  { pattern: /\bFinished npm install\b/i, phase: "dependencies installed", percent: 45 },
  { pattern: /\bRunning npm run build\b/i, phase: "building", percent: 50 },
  { pattern: /\bSkipped npm run build\b/i, phase: "nothing to build", percent: 65 },
  { pattern: /\bFinished npm run build\b/i, phase: "built", percent: 65 },
  { pattern: /\bCopying build output\b/i, phase: "copying build output", percent: 68 },
  { pattern: /\bInstalling runtime dependencies\b/i, phase: "installing runtime dependencies", percent: 70 },
  { pattern: /\bFinished runtime dependencies\b/i, phase: "runtime dependencies installed", percent: 74 },
  { pattern: /\bRunning copy\b/i, phase: "deploying", percent: 76 },
  { pattern: /\bFinished copy\b/i, phase: "deployed", percent: 78 },
];

// An uninstall runs none of the stages above, so without its own table it sat at one
// percentage for however long deleting a clone's node_modules takes. The manager prunes
// during an install too, so these are read only for a removal: the same line means
// "this job is nearly done" here and "something unrelated was tidied up" there.
const REMOVE_STAGES: Stage[] = [
  { pattern: /\bUninstalled plugin\b/i, phase: "deregistered", percent: 35 },
  { pattern: /\bRemoving repos\//i, phase: "removing files", percent: 45 },
  { pattern: /\bPruned orphaned repos\//i, phase: "files removed", percent: 75 },
  { pattern: /\bPruned orphaned plugin\//i, phase: "artifact removed", percent: 85 },
];

export function parseWorkerPhase(chunk: string, kind?: string): WorkerPhase | undefined {
  const stages = kind === "remove" ? REMOVE_STAGES : STAGES;
  let last: WorkerPhase | undefined;
  for (const line of chunk.split(/[\r\n]+/)) {
    if (!line) continue;
    for (const stage of stages) {
      if (stage.pattern.test(line)) {
        last = { phase: stage.phase, percent: stage.percent };
        break;
      }
    }
  }
  return last;
}
