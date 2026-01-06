import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { usePanelStore, PANEL_STORAGE_KEY } from "../panelStore";

const readPersistedSelection = () => {
  const raw = sessionStorage.getItem(PANEL_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && "state" in parsed) {
    return (parsed as { state?: { selected?: unknown } }).state?.selected ?? null;
  }
  return null;
};

describe("panelStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    sessionStorage.clear();
    usePanelStore.setState({ selected: [], lastOptimizationSummary: undefined });
    usePanelStore.persist.clearStorage();
  });

  it("rehydrates legacy array storage and filters invalid entries", async () => {
    sessionStorage.setItem(
      PANEL_STORAGE_KEY,
      JSON.stringify([
        { code: "ALT", name: "ALT" },
        { code: 123, name: "Bad" },
        { code: "AST" },
        null,
        { code: "B12", name: "B12" },
      ]),
    );

    await usePanelStore.persist.rehydrate();

    expect(usePanelStore.getState().selected).toEqual([
      { code: "ALT", name: "ALT" },
      { code: "B12", name: "B12" },
    ]);
  });

  it("ignores storage errors when reading persisted data", () => {
    const storage = usePanelStore.persist.getOptions().storage;
    expect(storage).toBeDefined();
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    expect(() => storage?.getItem(PANEL_STORAGE_KEY)).not.toThrow();
    expect(storage?.getItem(PANEL_STORAGE_KEY)).toBeNull();
    getItemSpy.mockRestore();
  });

  it("persists selection changes to sessionStorage", () => {
    usePanelStore.getState().addOne({ code: "ALT", name: "ALT" });

    expect(readPersistedSelection()).toEqual([{ code: "ALT", name: "ALT" }]);
  });

  it("addMany does not duplicate codes", () => {
    usePanelStore.setState({ selected: [{ code: "ALT", name: "ALT" }] });

    usePanelStore.getState().addMany([
      { code: "ALT", name: "ALT" },
      { code: "AST", name: "AST" },
      { code: "ALT", name: "ALT" },
      { code: "B12", name: "B12" },
    ]);

    expect(usePanelStore.getState().selected).toEqual([
      { code: "ALT", name: "ALT" },
      { code: "AST", name: "AST" },
      { code: "B12", name: "B12" },
    ]);
  });

  it("replaceAll preserves deterministic order", () => {
    usePanelStore.getState().replaceAll([
      { code: "B12", name: "B12" },
      { code: "ALT", name: "ALT" },
      { code: "B12", name: "B12" },
    ]);

    expect(usePanelStore.getState().selected).toEqual([
      { code: "B12", name: "B12" },
      { code: "ALT", name: "ALT" },
    ]);
  });

  it("records lastRemoved and clears it after 10 seconds", () => {
    vi.useFakeTimers();
    usePanelStore.setState({
      selected: [
        { code: "ALT", name: "ALT" },
        { code: "AST", name: "AST" },
      ],
    });

    usePanelStore.getState().remove("ALT");

    expect(usePanelStore.getState().lastRemoved?.biomarker).toEqual({
      code: "ALT",
      name: "ALT",
    });

    vi.advanceTimersByTime(10_000);

    expect(usePanelStore.getState().lastRemoved).toBeUndefined();
    vi.useRealTimers();
  });

  it("restores the last removed biomarker when undo is called", () => {
    usePanelStore.setState({
      selected: [
        { code: "ALT", name: "ALT" },
        { code: "AST", name: "AST" },
      ],
    });

    usePanelStore.getState().remove("ALT");
    usePanelStore.getState().undoLastRemoved();

    expect(usePanelStore.getState().selected).toEqual([
      { code: "AST", name: "AST" },
      { code: "ALT", name: "ALT" },
    ]);
  });
});
