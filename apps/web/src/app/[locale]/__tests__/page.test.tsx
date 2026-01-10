import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import enMessages from "../../../i18n/messages/en.json";
import plMessages from "../../../i18n/messages/pl.json";
import { BASE_URL } from "../../../lib/config";

// Mock next-intl/server's getTranslations
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
}));

// Mock the Home component to avoid complex client-side dependencies
vi.mock("../home-content", () => ({
  default: () => <div data-testid="home-content">Home Content</div>,
}));

import { getTranslations } from "next-intl/server";
import Page, { generateMetadata } from "../page";

const mockGetTranslations = vi.mocked(getTranslations);

// Helper to create a translator function for a given locale and namespace
const createMetaTranslator = (messages: typeof enMessages) => {
  // Since getTranslations is called with namespace "meta", t("title") returns messages.meta.title
  return (key: string) => {
    const metaMessages = messages.meta as Record<string, string>;
    return metaMessages[key] ?? key;
  };
};

describe("generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct metadata for Polish locale", async () => {
    const translator = createMetaTranslator(plMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "pl" }),
    });

    expect(mockGetTranslations).toHaveBeenCalledWith({
      locale: "pl",
      namespace: "meta",
    });
    expect(metadata.title).toBe(plMessages.meta.title);
    expect(metadata.description).toBe(plMessages.meta.description);
  });

  it("returns correct metadata for English locale", async () => {
    const translator = createMetaTranslator(enMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(mockGetTranslations).toHaveBeenCalledWith({
      locale: "en",
      namespace: "meta",
    });
    expect(metadata.title).toBe(enMessages.meta.title);
    expect(metadata.description).toBe(enMessages.meta.description);
  });

  it("sets canonical to / for Polish locale", async () => {
    const translator = createMetaTranslator(plMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "pl" }),
    });

    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("sets canonical to /en for English locale", async () => {
    const translator = createMetaTranslator(enMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe("/en");
  });

  it("includes correct language alternates", async () => {
    const translator = createMetaTranslator(plMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "pl" }),
    });

    expect(metadata.alternates?.languages).toEqual({
      pl: "/",
      en: "/en",
      "x-default": "/",
    });
  });

  it("sets correct openGraph locale for Polish", async () => {
    const translator = createMetaTranslator(plMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "pl" }),
    });

    expect(metadata.openGraph?.locale).toBe("pl_PL");
    expect(metadata.openGraph?.alternateLocale).toBe("en_US");
  });

  it("sets correct openGraph locale for English", async () => {
    const translator = createMetaTranslator(enMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.openGraph?.locale).toBe("en_US");
    expect(metadata.openGraph?.alternateLocale).toBe("pl_PL");
  });

  it("includes openGraph title and description", async () => {
    const translator = createMetaTranslator(enMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.openGraph?.title).toBe(enMessages.meta.title);
    expect(metadata.openGraph?.description).toBe(enMessages.meta.description);
  });
});

describe("Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders JSON-LD structured data for Polish locale", async () => {
    const translator = createMetaTranslator(plMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const PageComponent = await Page({ params: Promise.resolve({ locale: "pl" }) });
    const { container } = render(PageComponent);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();

    const jsonLd = JSON.parse(script!.textContent!.replace(/\\u003c/g, "<"));
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("WebSite");
    expect(jsonLd.name).toBe("Panelyt");
    expect(jsonLd.url).toBe(BASE_URL);
    expect(jsonLd.description).toBe(plMessages.meta.description);
    expect(jsonLd.inLanguage).toBe("pl-PL");
  });

  it("renders JSON-LD structured data for English locale", async () => {
    const translator = createMetaTranslator(enMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const PageComponent = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(PageComponent);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();

    const jsonLd = JSON.parse(script!.textContent!.replace(/\\u003c/g, "<"));
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("WebSite");
    expect(jsonLd.name).toBe("Panelyt");
    expect(jsonLd.url).toBe(BASE_URL);
    expect(jsonLd.description).toBe(enMessages.meta.description);
    expect(jsonLd.inLanguage).toBe("en-US");
  });

  it("uses translated site name in JSON-LD", async () => {
    const messages = {
      ...enMessages,
      meta: {
        ...enMessages.meta,
        siteName: "Panelyt Labs",
      },
    };
    const translator = createMetaTranslator(messages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const PageComponent = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(PageComponent);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();

    const jsonLd = JSON.parse(script!.textContent!.replace(/\\u003c/g, "<"));
    expect(jsonLd.name).toBe("Panelyt Labs");
  });

  it("escapes < characters in JSON-LD to prevent XSS", async () => {
    // Create a translator that returns a description with < character
    const maliciousMessages = {
      ...enMessages,
      meta: {
        ...enMessages.meta,
        description: 'Test <script>alert("XSS")</script> description',
      },
    };
    const translator = createMetaTranslator(maliciousMessages);
    mockGetTranslations.mockResolvedValueOnce(
      translator as unknown as Awaited<ReturnType<typeof getTranslations>>
    );

    const PageComponent = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(PageComponent);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();

    // The raw content should have escaped < as \u003c
    expect(script!.textContent).toContain("\\u003c");
    expect(script!.textContent).not.toContain("<script>");
  });
});
