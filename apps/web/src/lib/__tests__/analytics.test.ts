import { afterEach, describe, expect, it, vi } from "vitest";

import { track } from "../analytics";

describe("track", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      delete (window as { umami?: unknown }).umami;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
