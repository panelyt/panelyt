"use client";

import { useEffect, useState } from "react";

import { useInstitutionStore } from "../stores/institutionStore";

export function useInstitutionHydrated() {
  const persist = useInstitutionStore.persist;
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
