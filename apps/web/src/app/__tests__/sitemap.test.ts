import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { BASE_URL } from "@/lib/config";

import sitemap, { fetchTemplateSlugs } from "../sitemap";

describe("fetchTemplateSlugs", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("returns template slugs from API response", async () => {
    const mockTemplates = {
      templates: [
        { id: 1, slug: "basic-panel", name: "Basic Panel" },
        { id: 2, slug: "comprehensive-panel", name: "Comprehensive Panel" },
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockTemplates), { status: 200 })
    );

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual(["basic-panel", "comprehensive-panel"]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/biomarker-lists/templates"),
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        next: { revalidate: 3600 },
      })
    );
  });

  it("returns empty array when API returns empty templates", async () => {
    const mockTemplates = { templates: [] };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockTemplates), { status: 200 })
    );

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual([]);
  });

  it("returns empty array when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual([]);
  });

  it("returns empty array when API returns non-200 status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual([]);
  });

  it("returns empty array when response JSON is invalid", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not valid json", { status: 200 })
    );

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual([]);
  });

  it("returns empty array when response lacks templates field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ other: "data" }), { status: 200 })
    );

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual([]);
  });

  it("filters out templates without slug property", async () => {
    const mockTemplates = {
      templates: [
        { id: 1, name: "No slug here" },
        { id: 2, slug: "valid-panel", name: "Valid" },
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockTemplates), { status: 200 })
    );

    const slugs = await fetchTemplateSlugs();

    expect(slugs).toEqual(["valid-panel"]);
  });
});

describe("sitemap", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("includes static routes for both locales", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ templates: [] }), { status: 200 })
    );

    const entries = await sitemap();

    // Check Polish home page
    const plHome = entries.find((e) => e.url === `${BASE_URL}/`);
    expect(plHome).toBeDefined();
    expect(plHome?.alternates?.languages).toEqual({
      pl: `${BASE_URL}/`,
      en: `${BASE_URL}/en/`,
      "x-default": `${BASE_URL}/`,
    });

    // Check English home page
    const enHome = entries.find((e) => e.url === `${BASE_URL}/en/`);
    expect(enHome).toBeDefined();
    expect(enHome?.alternates?.languages).toEqual({
      pl: `${BASE_URL}/`,
      en: `${BASE_URL}/en/`,
      "x-default": `${BASE_URL}/`,
    });
  });

  it("includes template routes for both locales when templates exist", async () => {
    const mockTemplates = {
      templates: [
        { id: 1, slug: "basic-panel", name: "Basic Panel" },
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockTemplates), { status: 200 })
    );

    const entries = await sitemap();

    // Check Polish template page
    const plTemplate = entries.find(
      (e) => e.url === `${BASE_URL}/collections/basic-panel`
    );
    expect(plTemplate).toBeDefined();
    expect(plTemplate?.priority).toBe(0.7);
    expect(plTemplate?.changeFrequency).toBe("weekly");
    expect(plTemplate?.alternates?.languages).toEqual({
      pl: `${BASE_URL}/collections/basic-panel`,
      en: `${BASE_URL}/en/collections/basic-panel`,
      "x-default": `${BASE_URL}/collections/basic-panel`,
    });

    // Check English template page
    const enTemplate = entries.find(
      (e) => e.url === `${BASE_URL}/en/collections/basic-panel`
    );
    expect(enTemplate).toBeDefined();
    expect(enTemplate?.alternates?.languages).toEqual({
      pl: `${BASE_URL}/collections/basic-panel`,
      en: `${BASE_URL}/en/collections/basic-panel`,
      "x-default": `${BASE_URL}/collections/basic-panel`,
    });
  });

  it("returns only static routes when template fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const entries = await sitemap();

    // Should have static routes (4 routes * 2 locales = 8 entries)
    expect(entries.length).toBe(8);

    // Should not have any template routes
    const templateRoutes = entries.filter((e) =>
      e.url.includes("/collections/") && !e.url.endsWith("/collections")
    );
    expect(templateRoutes).toHaveLength(0);
  });
});
