import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";

import { useLabOptimization } from "../useLabOptimization";
import enMessages from "../../i18n/messages/en.json";

// Mock response data
const createMockOptimizeResponse = (biomarkers: string[], labCode: string, mode: string) => ({
  biomarkers,
  mode,
  lab_code: labCode,
  lab_name: labCode === "diag" ? "DIAG Lab" : "ALAB Lab",
  items: [
    {
      id: 1,
      code: "TEST1",
      name: "Test Panel",
      lab_code: labCode,
      biomarkers,
      price_now: 50,
      price_min30: 45,
    },
  ],
  uncovered: [],
  total_now: 50,
  total_min30: 45,
  bonus_total_now: 0,
  lab_options: [
    { code: "diag", name: "DIAG Lab", covers_all: true, missing_tokens: [] },
    { code: "alab", name: "ALAB Lab", covers_all: true, missing_tokens: [] },
  ],
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  };
}

describe("useLabOptimization debounce behavior", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      // Parse the request body to return appropriate mock response
      let biomarkers = ["TSH"];
      if (options?.body) {
        try {
          const body = JSON.parse(options.body as string);
          biomarkers = body.biomarkers || ["TSH"];
        } catch {
          // ignore parse errors
        }
      }
      const responseBody = createMockOptimizeResponse(biomarkers, "diag", "auto");
      return Promise.resolve(
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("debounces optimization requests during rapid biomarker selection", async () => {
    const wrapper = createWrapper();

    // Start with empty to avoid initial fetch
    const { rerender } = renderHook(
      ({ codes }) => useLabOptimization(codes),
      {
        wrapper,
        initialProps: { codes: [] as string[] },
      }
    );

    // Clear any setup calls
    fetchMock.mockClear();

    // Rapid changes within debounce window (400ms)
    rerender({ codes: ["TSH"] });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    rerender({ codes: ["TSH", "T4"] });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    rerender({ codes: ["TSH", "T4", "FT3"] });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    rerender({ codes: ["TSH", "T4", "FT3", "FT4"] });

    // At this point, 300ms have passed since first change
    // Still within debounce window from latest change
    // No fetch calls should have been made yet
    expect(fetchMock).not.toHaveBeenCalled();

    // Now wait for debounce to complete (400ms from last change)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Should have made API calls now
    expect(fetchMock).toHaveBeenCalled();

    // All POST calls should use the final biomarker set
    const postCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "POST"
    );

    expect(postCalls.length).toBeGreaterThan(0);

    for (const call of postCalls) {
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      // The final biomarker set should be used
      expect(body.biomarkers).toEqual(["TSH", "T4", "FT3", "FT4"]);
    }
  });

  it("maintains stable state during debounce period without crashing", async () => {
    const wrapper = createWrapper();

    // Start with empty biomarkers
    const { result, rerender } = renderHook(
      ({ codes }) => useLabOptimization(codes),
      {
        wrapper,
        initialProps: { codes: [] as string[] },
      }
    );

    // Initially, should show empty labCards (no labs to display)
    expect(result.current.labCards.length).toBe(0);
    expect(result.current.labChoice).toBeNull();
    expect(result.current.activeResult).toBeUndefined();

    // Add biomarkers
    rerender({ codes: ["TSH"] });

    // During debounce period, hook should maintain stable state
    // labCards remains empty until data loads (no crash, no errors)
    expect(result.current.labCards.length).toBe(0);
    expect(result.current.activeLoading).toBe(false); // Not loading yet because debounce hasn't fired

    // Advance partially into debounce window
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Still during debounce - state remains stable
    expect(result.current.labCards.length).toBe(0);

    // Change biomarkers again - should reset debounce
    rerender({ codes: ["TSH", "T4"] });

    // Hook state should still be stable
    expect(result.current.labChoice).toBeNull();
    expect(result.current.activeResult).toBeUndefined();
  });

  it("uses debounced value for API calls, not immediate value", async () => {
    const wrapper = createWrapper();

    const { rerender } = renderHook(({ codes }) => useLabOptimization(codes), {
      wrapper,
      initialProps: { codes: ["TSH"] },
    });

    // Clear mock calls from initial render
    fetchMock.mockClear();

    // Change biomarkers
    rerender({ codes: ["TSH", "T4"] });

    // Immediately check - should NOT have made calls yet
    expect(fetchMock).not.toHaveBeenCalled();

    // Advance time but not past debounce threshold
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Still should not have called
    expect(fetchMock).not.toHaveBeenCalled();

    // Now complete the debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Now calls should have been made
    expect(fetchMock).toHaveBeenCalled();
  });

  it("cancels pending debounce when value changes", async () => {
    const wrapper = createWrapper();

    const { rerender } = renderHook(({ codes }) => useLabOptimization(codes), {
      wrapper,
      initialProps: { codes: ["TSH"] },
    });

    fetchMock.mockClear();

    // First change
    rerender({ codes: ["TSH", "T4"] });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Change again before debounce completes
    rerender({ codes: ["TSH", "T4", "FT3"] });

    // Wait for original debounce time to pass
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // The intermediate value ["TSH", "T4"] should NOT have triggered a fetch
    // because it was superseded before debounce completed
    const callsWithIntermediateValue = fetchMock.mock.calls.filter(
      (call) => {
        const options = call[1] as RequestInit | undefined;
        if (options?.method !== "POST") return false;
        const body = JSON.parse(options.body as string);
        return (
          body.biomarkers?.length === 2 &&
          body.biomarkers?.includes("TSH") &&
          body.biomarkers?.includes("T4") &&
          !body.biomarkers?.includes("FT3")
        );
      }
    );

    expect(callsWithIntermediateValue.length).toBe(0);

    // Complete debounce for final value
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Should have calls with final value
    const callsWithFinalValue = fetchMock.mock.calls.filter(
      (call) => {
        const options = call[1] as RequestInit | undefined;
        if (options?.method !== "POST") return false;
        const body = JSON.parse(options.body as string);
        return body.biomarkers?.includes("FT3");
      }
    );

    expect(callsWithFinalValue.length).toBeGreaterThan(0);
  });

  it("clears cache and state when biomarkers are cleared", async () => {
    const wrapper = createWrapper();

    const { result, rerender } = renderHook(
      ({ codes }) => useLabOptimization(codes),
      {
        wrapper,
        initialProps: { codes: ["TSH", "T4"] },
      }
    );

    // Wait for initial load
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Clear biomarkers
    rerender({ codes: [] });

    // Wait for debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // State should be cleared
    expect(result.current.labChoice).toBeNull();
    expect(result.current.labCards.length).toBe(0);
    expect(result.current.activeResult).toBeUndefined();
  });

  it("passes abort signal through to fetch requests", async () => {
    const wrapper = createWrapper();

    renderHook(({ codes }) => useLabOptimization(codes), {
      wrapper,
      initialProps: { codes: ["TSH"] },
    });

    // Wait for debounce and request
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Check that fetch was called with an abort signal
    const postCalls = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "POST"
    );

    expect(postCalls.length).toBeGreaterThan(0);

    for (const call of postCalls) {
      const options = call[1] as RequestInit;
      expect(options.signal).toBeDefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe("useLabOptimization state management", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
        let biomarkers = ["TSH", "T4"];
        if (options?.body) {
          try {
            const body = JSON.parse(options.body as string);
            biomarkers = body.biomarkers || ["TSH", "T4"];
          } catch {
            // ignore parse errors
          }
        }
        const responseBody = createMockOptimizeResponse(biomarkers, "diag", "auto");
        return Promise.resolve(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("clears lab choice and active result when biomarkers are emptied", async () => {
    const wrapper = createWrapper();

    // Start with some biomarkers
    const { result, rerender } = renderHook(
      ({ codes }) => useLabOptimization(codes),
      {
        wrapper,
        initialProps: { codes: ["TSH", "T4"] },
      }
    );

    // Initial state
    expect(result.current.labChoice).toBeNull();
    expect(result.current.activeResult).toBeUndefined();

    // Clear biomarkers
    rerender({ codes: [] });

    // Wait for debounce to settle
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // State should be reset
    expect(result.current.labChoice).toBeNull();
    expect(result.current.labCards.length).toBe(0);
    expect(result.current.activeResult).toBeUndefined();
  });

  it("returns empty labCards when no biomarkers are selected", async () => {
    const wrapper = createWrapper();

    const { result } = renderHook(
      ({ codes }) => useLabOptimization(codes),
      {
        wrapper,
        initialProps: { codes: [] as string[] },
      }
    );

    // With no biomarkers, labCards should be empty
    expect(result.current.labCards).toEqual([]);
    expect(result.current.labChoice).toBeNull();
  });

  it("provides selectLab and resetLabChoice functions", async () => {
    const wrapper = createWrapper();

    const { result } = renderHook(
      ({ codes }) => useLabOptimization(codes),
      {
        wrapper,
        initialProps: { codes: ["TSH"] },
      }
    );

    // Functions should be defined
    expect(typeof result.current.selectLab).toBe("function");
    expect(typeof result.current.resetLabChoice).toBe("function");

    // selectLab should update labChoice
    act(() => {
      result.current.selectLab("diag");
    });
    expect(result.current.labChoice).toBe("diag");

    // selectLab with "all" should set labChoice to "all"
    act(() => {
      result.current.selectLab("all");
    });
    expect(result.current.labChoice).toBe("all");

    // resetLabChoice should clear labChoice
    act(() => {
      result.current.resetLabChoice();
    });
    expect(result.current.labChoice).toBeNull();
  });
});
