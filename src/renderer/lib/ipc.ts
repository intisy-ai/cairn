import type { IntisyAPI } from "@dashboard/shared";

declare global {
  interface Window {
    intisy: IntisyAPI;
  }
}

export const intisy: IntisyAPI = window.intisy;
