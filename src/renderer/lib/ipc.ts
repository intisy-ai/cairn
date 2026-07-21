import type { IntisyAPI } from "@dashboard/shared";

declare global {
  interface Window {
    intisy: IntisyAPI;
  }
}

export const intisy: IntisyAPI = new Proxy({} as IntisyAPI, {
  get(_target, property) {
    return (window.intisy as unknown as Record<string | symbol, unknown>)[property];
  },
});
