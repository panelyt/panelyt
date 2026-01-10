import { afterEach, describe, expect, it, vi } from "vitest";

import { track, markTtorStart, resetTtorStart, consumeTtorDuration } from "../analytics";

describe("track", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      delete (window as { umami?: unknown }).umami;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetTtorStart();
  });

  it("no-ops during SSR when window is undefined", () => {
    vi.stubGlobal("window", undefined);

    expect(() => track("panel_added")).not.toThrow();
  });

  it("no-ops when Umami is unavailable", () => {
    expect(() => track("panel_added")).not.toThrow();
  });

  it("forwards events to Umami with payloads", () => {
    const trackMock = vi.fn();
    Object.defineProperty(window, "umami", {
      value: { track: trackMock },
      configurable: true,
    });

    track("panel_added", { count: 2 });

    expect(trackMock).toHaveBeenCalledWith("panel_added", { count: 2 });
  });

  it("forwards events to Umami without payloads", () => {
    const trackMock = vi.fn();
    Object.defineProperty(window, "umami", {
      value: { track: trackMock },
      configurable: true,
    });

    track("panel_added");

    expect(trackMock).toHaveBeenCalledWith("panel_added");
  });
});

describe("TTOR helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetTtorStart();
  });

  it("returns null when no TTOR start exists", () => {
    expect(consumeTtorDuration()).toBeNull();
  });

  it("records and consumes TTOR duration", () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_500);

    markTtorStart();

    expect(consumeTtorDuration()).toBe(1_500);
    expect(consumeTtorDuration()).toBeNull();
  });

  it("resets TTOR state explicitly", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    markTtorStart();
    resetTtorStart();

    expect(consumeTtorDuration()).toBeNull();
  });
});
