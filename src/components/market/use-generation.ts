"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Selected generation for a model page, shared between the generation pills,
 * the charts and the valuation tool. Persisted per model in localStorage,
 * wrapped in try/catch because storage can be unavailable.
 */
const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function key(modelSlug: string) {
  return `inauto-gen:${modelSlug}`;
}
function read(modelSlug: string): string | null {
  const m = memory.get(modelSlug);
  if (m) return m;
  try {
    return localStorage.getItem(key(modelSlug));
  } catch {
    return null;
  }
}
function write(modelSlug: string, code: string) {
  memory.set(modelSlug, code);
  try {
    localStorage.setItem(key(modelSlug), code);
  } catch {}
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useGeneration(modelSlug: string, valid: string[], fallback: string) {
  const selected = useSyncExternalStore(
    subscribe,
    () => {
      const v = read(modelSlug);
      return v && valid.includes(v) ? v : fallback;
    },
    () => fallback,
  );
  const select = useCallback((code: string) => write(modelSlug, code), [modelSlug]);
  return [selected, select] as const;
}
