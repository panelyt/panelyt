"use client";

import { useEffect, useState } from "react";

import { usePanelStore } from "../stores/panelStore";

export function usePanelHydrated() {
  const persist = usePanelStore.persist;
  const hasPersist = typeof persist?.hasHydrated === "function";
  const [hydrated, setHydrated] = useState(() =>
    hasPersist ? persist.hasHydrated() : true,
  );

  useEffect(() => {
    if (!hasPersist) {
      return;
    }

    if (persist.hasHydrated()) {
      if (!hydrated) {
        setHydrated(true);
      }
      return;
    }

    const unsubscribe = persist.onFinishHydration(() => {
      setHydrated(true);
    });

    return unsubscribe;
  }, [hasPersist, hydrated, persist]);

  return hydrated;
}
