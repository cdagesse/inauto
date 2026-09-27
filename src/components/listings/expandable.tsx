"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A tiny shared toggle so a button in the sidebar can expand a full-width
 * region further down the page (the market data block on listing pages).
 */
const listeners = new Set<() => void>();
const state = new Map<string, boolean>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function set(key: string, open: boolean) {
  state.set(key, open);
  listeners.forEach((l) => l());
}

export function useExpanded(key: string) {
  const open = useSyncExternalStore(
    subscribe,
    () => state.get(key) ?? false,
    () => false,
  );
  const toggle = useCallback(() => set(key, !(state.get(key) ?? false)), [key]);
  return [open, toggle] as const;
}

export function ExpandToggle({
  id,
  labelOpen,
  labelClosed,
  className = "btn sm",
}: {
  id: string;
  labelOpen: string;
  labelClosed: string;
  className?: string;
}) {
  const [open, toggle] = useExpanded(id);
  return (
    <button
      type="button"
      className={className}
      aria-expanded={open}
      aria-controls={`expanded-${id}`}
      onClick={() => {
        toggle();
        if (!open)
          requestAnimationFrame(() =>
            document
              .getElementById(`expanded-${id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
      }}
    >
      {open ? labelOpen : labelClosed}
    </button>
  );
}

export function ExpandedRegion({ id, children }: { id: string; children: React.ReactNode }) {
  const [open] = useExpanded(id);
  return (
    <div id={`expanded-${id}`} className="expanded-region" hidden={!open}>
      {open ? children : null}
    </div>
  );
}
