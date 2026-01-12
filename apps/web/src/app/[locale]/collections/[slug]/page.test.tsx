import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

import { getTranslations } from "next-intl/server";
import { getParsedJson } from "../../../../lib/http";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
}));

vi.mock("../../../../lib/http", () => ({
  getParsedJson: vi.fn(),
}));

vi.mock("./template-detail-content", () => ({
  default: () => null,
}));

const mockGetTranslations = vi.mocked(getTranslations);
const mockGetParsedJson = vi.mocked(getParsedJson);

const buildTranslator = () => {
  const translate = (key: string, values?: Record<string, string>) => {
    if (key === "templateDetailTitle") {
      return `${values?.name} | Panelyt`;
    }
    if (key === "templateDetailDescription") {
      return `Explore tests for the ${values?.name} panel.`;
    }
    return key;
  };

  return Object.assign(translate, {
    rich: translate,
    markup: translate,
    raw: translate,
    has: () => true,
  });
};

describe("template detail metadata", () => {
  it("builds metadata using the template name", async () => {
    const translator = buildTranslator() as unknown as Awaited<ReturnType<typeof getTranslations>>;
    mockGetTranslations.mockResolvedValue(translator);
    mockGetParsedJson.mockResolvedValue({
      name: "Heart Health",
    });

    const pageModule = (await import("./page")) as unknown as {
      generateMetadata?: (args: {
        params: Promise<{ locale: string; slug: string }>;
      }) => Promise<Metadata>;
    };

    if (!pageModule.generateMetadata) {
      expect(pageModule.generateMetadata).toBeDefined();
      return;
    }

    const metadata = await pageModule.generateMetadata({
      params: Promise.resolve({ locale: "en", slug: "heart-template" }),
    });

    expect(metadata).toMatchObject({
      title: "Heart Health | Panelyt",
      description: "Explore tests for the Heart Health panel.",
      alternates: {
        canonical: "/en/collections/heart-template",
        languages: {
          pl: "/collections/heart-template",
          en: "/en/collections/heart-template",
        },
      },
      openGraph: {
        title: "Heart Health | Panelyt",
        description: "Explore tests for the Heart Health panel.",
        locale: "en_US",
        alternateLocale: "pl_PL",
      },
    });
  });

  it("falls back to the slug when the fetch fails", async () => {
    const translator = buildTranslator() as unknown as Awaited<ReturnType<typeof getTranslations>>;
    mockGetTranslations.mockResolvedValue(translator);
    mockGetParsedJson.mockRejectedValue(new Error("boom"));

    const pageModule = (await import("./page")) as unknown as {
      generateMetadata?: (args: {
        params: Promise<{ locale: string; slug: string }>;
      }) => Promise<Metadata>;
    };

    if (!pageModule.generateMetadata) {
      expect(pageModule.generateMetadata).toBeDefined();
      return;
    }

    const metadata = await pageModule.generateMetadata({
      params: Promise.resolve({ locale: "pl", slug: "metabolic-basics" }),
    });

    expect(metadata).toMatchObject({
      title: "metabolic-basics | Panelyt",
      description: "Explore tests for the metabolic-basics panel.",
      alternates: {
        canonical: "/collections/metabolic-basics",
        languages: {
          pl: "/collections/metabolic-basics",
          en: "/en/collections/metabolic-basics",
        },
      },
      openGraph: {
        title: "metabolic-basics | Panelyt",
        description: "Explore tests for the metabolic-basics panel.",
        locale: "pl_PL",
        alternateLocale: "en_US",
      },
    });
  });
});

describe("template detail page", () => {
  it("passes the slug from params", async () => {
    const pageModule = (await import("./page")) as unknown as {
      default: (args: { params: Promise<{ locale: string; slug: string }> }) => Promise<{
        props?: { slug?: string };
      }>;
    };

    const element = await pageModule.default({
      params: Promise.resolve({ locale: "en", slug: "heart-template" }),
    });

    expect(element.props?.slug).toBe("heart-template");
  });
});
