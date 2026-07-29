// App-identity marks keyed by app id, so deployment pills and detail views show
// a recognizable logo instead of a two-letter abbreviation. Unknown apps (custom
// ones added via the registry) fall back to a lettermark in the UI. Marks are
// self-contained SVG strings rendered at a single enforced size everywhere.
const ICONS: Record<string, string> = {
  claude: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#d97757"/><g stroke="#fff" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/><line x1="7.4" y1="7.4" x2="16.6" y2="16.6"/><line x1="16.6" y1="7.4" x2="7.4" y2="16.6"/></g></svg>`,
  opencode: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#15171c"/><path d="M7 9l3 3-3 3" fill="none" stroke="#e8e8ea" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="12.5" y1="15.5" x2="17" y2="15.5" stroke="#e8e8ea" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  cairn: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#4b53b8"/><g fill="#fff"><path d="M12 5.5l2.4 4.2H9.6z"/><path d="M8.7 10.6h6.6l1.7 3.1H7z"/><path d="M6.4 14.5h11.2L19 18H5z"/></g></svg>`,
};

export function appIcon(appId: string): string | null {
  return ICONS[appId] ?? null;
}
