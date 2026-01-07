"use client";

import { useEffect, useState } from "react";

import { usePanelStore } from "../stores/panelStore";

export function usePanelHydrated() {
  const [hydrated, setHydrated] = useState(() => usePanelStore.persist.hasHydrated());

  useEffect(() => {
    if (usePanelStore.persist.hasHydrated()) {
      if (!hydrated) {
        setHydrated(true);
      }
      return;
    }

    const unsubscribe = usePanelStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    return unsubscribe;
  }, [hydrated]);

  return hydrated;
}
