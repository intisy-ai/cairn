// Reads git's own transfer progress off a worker's stderr. git reports lines like
//   Receiving objects:  45% (450/1000), 1.20 MiB | 3.40 MiB/s
// which is the only honest source of a byte count and a rate: nothing else in the install
// knows how much there is to fetch.

export interface Transfer {
  // The git stage that reported it ("Receiving objects", "Resolving deltas", ...).
  stage: string;
  percent: number;
  bytes?: number;
  bytesPerSecond?: number;
}

const UNITS: Record<string, number> = {
  b: 1,
  kib: 1024, kb: 1000,
  mib: 1024 ** 2, mb: 1000 ** 2,
  gib: 1024 ** 3, gb: 1000 ** 3,
};

export function toBytes(value: number, unit: string): number | undefined {
  const factor = UNITS[unit.trim().toLowerCase()];
  return factor === undefined ? undefined : Math.round(value * factor);
}

// git rewrites a progress line in place with \r, so a chunk can hold many updates and no
// trailing newline. Splitting on both keeps the last, most recent one.
const LINE = /(?:^|[\r\n])([A-Za-z][A-Za-z ]*?):\s+(\d{1,3})%[^\r\n]*/g;
const TRANSFERRED = /,\s*([\d.]+)\s*([KMGTkmgt]?i?[Bb])(?:\s*\|\s*([\d.]+)\s*([KMGTkmgt]?i?[Bb])\/s)?/;

export function parseGitProgress(chunk: string): Transfer | undefined {
  let last: Transfer | undefined;
  for (const match of chunk.matchAll(LINE)) {
    const [line, stage, percent] = match;
    const transfer: Transfer = { stage: stage.trim(), percent: Math.min(100, Number(percent)) };
    const sizes = TRANSFERRED.exec(line);
    if (sizes) {
      transfer.bytes = toBytes(Number(sizes[1]), sizes[2]);
      if (sizes[3] && sizes[4]) transfer.bytesPerSecond = toBytes(Number(sizes[3]), sizes[4]);
    }
    last = transfer;
  }
  return last;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}
