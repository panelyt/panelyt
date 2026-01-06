"use client";

export const SEARCH_PREFILL_EVENT = "panelyt:search-prefill";

export function dispatchSearchPrefill(code: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = code.trim();
  if (!normalized) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(SEARCH_PREFILL_EVENT, { detail: { code: normalized } }),
  );
}
