import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getJson, postJson, postParsedJson, putJson, deleteRequest, extractErrorMessage } from "../http";
import { z } from "zod";

describe("http utilities abort signal support", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  describe("getJson", () => {
    it("passes abort signal to fetch", async () => {
      const mockResponse = { data: "test" };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const controller = new AbortController();
      await getJson("/test", { signal: controller.signal });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it("throws AbortError when request is aborted", async () => {
      vi.mocked(fetch).mockImplementationOnce((_url, init) => {
        if (init?.signal?.aborted) {
          throw new DOMException("The operation was aborted", "AbortError");
        }
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      });

      const controller = new AbortController();
      controller.abort();

      await expect(getJson("/test", { signal: controller.signal })).rejects.toMatchObject({
        name: "AbortError",
      });
    });
  });

  describe("postJson", () => {
    it("passes abort signal to fetch", async () => {
      const mockResponse = { result: "ok" };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const controller = new AbortController();
      await postJson("/test", { foo: "bar" }, { signal: controller.signal });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it("throws AbortError when request is aborted mid-flight", async () => {
      vi.mocked(fetch).mockImplementationOnce((_url, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
          // Simulate delayed response to allow abortion
          setTimeout(() => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          }, 100);
        });
      });

      const controller = new AbortController();
      const promise = postJson("/test", { foo: "bar" }, { signal: controller.signal });
      controller.abort();

      await expect(promise).rejects.toMatchObject({
        name: "AbortError",
      });
    });
  });

  describe("postParsedJson", () => {
    it("passes abort signal to fetch", async () => {
      const mockResponse = { name: "test", value: 42 };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const schema = z.object({ name: z.string(), value: z.number() });
      const controller = new AbortController();
      await postParsedJson("/test", schema, { data: true }, { signal: controller.signal });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe("putJson", () => {
    it("passes abort signal to fetch", async () => {
      const mockResponse = { updated: true };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const controller = new AbortController();
      await putJson("/test", { foo: "bar" }, { signal: controller.signal });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe("deleteRequest", () => {
    it("passes abort signal to fetch", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

      const controller = new AbortController();
      await deleteRequest("/test", { signal: controller.signal });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe("extractErrorMessage", () => {
    it("returns the provided fallback for unknown errors", () => {
      expect(extractErrorMessage(null, "Fallback message")).toBe("Fallback message");
    });
  });
});
