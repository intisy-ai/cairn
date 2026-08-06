// How the dashboard talks about when something happened. Shared so the activity log and the
// download log agree, rather than each rounding it their own way.

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

export function relativeTime(ts: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < MINUTE) return "just now";
  const minutes = Math.round(seconds / MINUTE);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Past a week "9d ago" stops meaning anything, so it becomes a date. Under a week the
// relative form is the more useful of the two.
export function whenLabel(ts: number, now = Date.now()): string {
  return now - ts < 7 * DAY * 1000 ? relativeTime(ts, now) : new Date(ts).toLocaleDateString();
}

export function exactTime(ts: number): string {
  return new Date(ts).toLocaleString();
}
