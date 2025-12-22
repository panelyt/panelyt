import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTranslations } from "next-intl";

import plMessages from "../../i18n/messages/pl.json";
import LocaleLayout from "./layout";

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl/server")>(
    "next-intl/server",
  );

  return {
    ...actual,
    getMessages: vi.fn(async () => plMessages),
    setRequestLocale: vi.fn(),
  };
});

function TranslationProbe() {
  const t = useTranslations("language");
  return <span>{t("switch")}</span>;
}

describe("LocaleLayout", () => {
  it("provides translations for locale-scoped routes", async () => {
    const element = await LocaleLayout({
      children: <TranslationProbe />,
      params: Promise.resolve({ locale: "pl" }),
    });

    render(element);

    expect(screen.getByText(plMessages.language.switch)).toBeInTheDocument();
  });
});
