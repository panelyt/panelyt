import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../lib/analytics", () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}));

import { track, markTtorStart, resetTtorStart } from "../../lib/analytics";
import { usePanelStore, PANEL_STORAGE_KEY, type OptimizationSummary } from "../panelStore";

const trackMock = vi.mocked(track);
const markTtorStartMock = vi.mocked(markTtorStart);
const resetTtorStartMock = vi.mocked(resetTtorStart);

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
    trackMock.mockClear();
    markTtorStartMock.mockClear();
    resetTtorStartMock.mockClear();
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

  it("tracks panel_add_biomarker when adding a new biomarker", () => {
    usePanelStore.getState().addOne({ code: "ALT", name: "ALT" });

    expect(trackMock).toHaveBeenCalledWith("panel_add_biomarker", { count: 1 });
  });

  it("marks TTOR when the first biomarker is added to an empty panel", () => {
    usePanelStore.getState().addOne({ code: "ALT", name: "ALT" });

    expect(markTtorStartMock).toHaveBeenCalled();
  });

  it("tracks panel_add_biomarker when addMany adds multiple biomarkers", () => {
    usePanelStore.getState().addMany([
      { code: "ALT", name: "ALT" },
      { code: "AST", name: "AST" },
    ]);

    expect(trackMock).toHaveBeenCalledWith("panel_add_biomarker", { count: 2 });
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

  it("tracks panel_remove_biomarker when an item is removed", () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
    });

    usePanelStore.getState().remove("ALT");

    expect(trackMock).toHaveBeenCalledWith("panel_remove_biomarker", { count: 1 });
  });

  it("resets TTOR when the last biomarker is removed", () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
    });

    usePanelStore.getState().remove("ALT");

    expect(resetTtorStartMock).toHaveBeenCalled();
  });

  it("resets TTOR when the panel is cleared", () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
    });

    usePanelStore.getState().clearAll();

    expect(resetTtorStartMock).toHaveBeenCalled();
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

  it("stores the latest optimization summary", () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
      lastOptimizationSummary: undefined,
    });

    const summary: OptimizationSummary = {
      key: "alt",
      totalNow: 120,
      totalMin30: 100,
      uncoveredCount: 0,
      updatedAt: "2026-01-02T00:00:00Z",
    };

    usePanelStore.getState().setOptimizationSummary(summary);

    expect(usePanelStore.getState().lastOptimizationSummary).toEqual(summary);
  });

  it("clears the optimization summary when the selection changes", () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
      lastOptimizationSummary: {
        key: "alt",
        totalNow: 120,
        totalMin30: 100,
        uncoveredCount: 0,
        updatedAt: "2026-01-02T00:00:00Z",
      },
    });

    usePanelStore.getState().addOne({ code: "AST", name: "AST" });

    expect(usePanelStore.getState().lastOptimizationSummary).toBeUndefined();
  });
});
