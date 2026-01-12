import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_INSTITUTION_ID,
  INSTITUTION_STORAGE_KEY,
  useInstitutionStore,
} from "../institutionStore";

const readPersistedInstitution = () => {
  const raw = localStorage.getItem(INSTITUTION_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && "state" in parsed) {
    return (parsed as { state?: unknown }).state ?? null;
  }
  return null;
};

describe("institutionStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionStore.setState({
      institutionId: DEFAULT_INSTITUTION_ID,
      label: null,
    });
    useInstitutionStore.persist.clearStorage();
  });

  it("rehydrates persisted institution selection", async () => {
    localStorage.setItem(
      INSTITUTION_STORAGE_KEY,
      JSON.stringify({
        state: { institutionId: 2222, label: "Warsaw" },
        version: 0,
      }),
    );

    await useInstitutionStore.persist.rehydrate();

    expect(useInstitutionStore.getState().institutionId).toBe(2222);
    expect(useInstitutionStore.getState().label).toBe("Warsaw");
  });

  it("persists selections to localStorage", () => {
    useInstitutionStore.getState().setInstitution({ id: 2222, label: "Warsaw" });

    expect(readPersistedInstitution()).toEqual({
      institutionId: 2222,
      label: "Warsaw",
    });
  });

  it("falls back to the default when persisted data is invalid", async () => {
    localStorage.setItem(INSTITUTION_STORAGE_KEY, JSON.stringify({ foo: "bar" }));

    await useInstitutionStore.persist.rehydrate();

    expect(useInstitutionStore.getState().institutionId).toBe(DEFAULT_INSTITUTION_ID);
  });
});
