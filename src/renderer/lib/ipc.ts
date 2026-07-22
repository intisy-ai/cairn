import type { CairnAPI } from "@cairn/shared";

declare global {
  interface Window {
    cairn: CairnAPI;
  }
}

export const cairn: CairnAPI = new Proxy({} as CairnAPI, {
  get(_target, property) {
    return (window.cairn as unknown as Record<string | symbol, unknown>)[property];
  },
});
