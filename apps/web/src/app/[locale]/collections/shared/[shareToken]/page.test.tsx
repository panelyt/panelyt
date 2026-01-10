import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

import { getTranslations } from "next-intl/server";
import { getParsedJson } from "../../../../../lib/http";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
}));

vi.mock("../../../../../lib/http", () => ({
  getParsedJson: vi.fn(),
}));

vi.mock("./shared-content", () => ({
  default: () => null,
}));

const mockGetTranslations = vi.mocked(getTranslations);
const mockGetParsedJson = vi.mocked(getParsedJson);

const buildTranslator = () => {
  const translate = (key: string, values?: Record<string, string>) => {
    if (key === "sharedListTitle") {
      return `${values?.name} | Panelyt`;
    }
    if (key === "sharedListDescription") {
      return `View tests and live pricing for the shared panel ${values?.name}.`;
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

describe("shared list metadata", () => {
  it("builds metadata using the shared list name", async () => {
    const translator = buildTranslator() as unknown as Awaited<ReturnType<typeof getTranslations>>;
    mockGetTranslations.mockResolvedValue(translator);
    mockGetParsedJson.mockResolvedValue({
      name: "Hormone panel",
    });

    const pageModule = (await import("./page")) as unknown as {
      generateMetadata?: (args: {
        params: Promise<{ locale: string; shareToken: string }>;
      }) => Promise<Metadata>;
    };

    if (!pageModule.generateMetadata) {
      expect(pageModule.generateMetadata).toBeDefined();
      return;
    }

    const metadata = await pageModule.generateMetadata({
      params: Promise.resolve({ locale: "en", shareToken: "token-123" }),
    });

    expect(metadata).toMatchObject({
      title: "Hormone panel | Panelyt",
      description: "View tests and live pricing for the shared panel Hormone panel.",
      alternates: {
        canonical: "/en/collections/shared/token-123",
        languages: {
          pl: "/collections/shared/token-123",
          en: "/en/collections/shared/token-123",
        },
      },
      openGraph: {
        title: "Hormone panel | Panelyt",
        description: "View tests and live pricing for the shared panel Hormone panel.",
        locale: "en_US",
        alternateLocale: "pl_PL",
      },
    });
  });

  it("falls back to the share token when the fetch fails", async () => {
    const translator = buildTranslator() as unknown as Awaited<ReturnType<typeof getTranslations>>;
    mockGetTranslations.mockResolvedValue(translator);
    mockGetParsedJson.mockRejectedValue(new Error("boom"));

    const pageModule = (await import("./page")) as unknown as {
      generateMetadata?: (args: {
        params: Promise<{ locale: string; shareToken: string }>;
      }) => Promise<Metadata>;
    };

    if (!pageModule.generateMetadata) {
      expect(pageModule.generateMetadata).toBeDefined();
      return;
    }

    const metadata = await pageModule.generateMetadata({
      params: Promise.resolve({ locale: "pl", shareToken: "token-456" }),
    });

    expect(metadata).toMatchObject({
      title: "token-456 | Panelyt",
      description: "View tests and live pricing for the shared panel token-456.",
      alternates: {
        canonical: "/collections/shared/token-456",
        languages: {
          pl: "/collections/shared/token-456",
          en: "/en/collections/shared/token-456",
        },
      },
      openGraph: {
        title: "token-456 | Panelyt",
        description: "View tests and live pricing for the shared panel token-456.",
        locale: "pl_PL",
        alternateLocale: "en_US",
      },
    });
  });
});

describe("shared list page", () => {
  it("passes the share token from params", async () => {
    const pageModule = (await import("./page")) as unknown as {
      default: (args: { params: Promise<{ locale: string; shareToken: string }> }) => Promise<{
        props?: { shareToken?: string };
      }>;
    };

    const element = await pageModule.default({
      params: Promise.resolve({ locale: "en", shareToken: "token-789" }),
    });

    expect(element.props?.shareToken).toBe("token-789");
  });
});
