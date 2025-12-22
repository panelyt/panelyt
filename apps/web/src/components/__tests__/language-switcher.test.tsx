import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "../language-switcher";
import { renderWithIntl } from "../../test/utils";
import enMessages from "../../i18n/messages/en.json";
import plMessages from "../../i18n/messages/pl.json";
import * as navigation from "../../i18n/navigation";

describe("LanguageSwitcher", () => {
  it("links to Polish when viewing English pages", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/collections");

    renderWithIntl(<LanguageSwitcher />, { locale: "en", messages: enMessages });

    const link = screen.getByRole("link", { name: enMessages.language.switch });
    expect(link).toHaveAttribute("data-locale", "pl");
    expect(link).toHaveAttribute("href", "/collections");
  });

  it("adds an English prefix when switching from Polish", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/collections");

    renderWithIntl(<LanguageSwitcher />, { locale: "pl", messages: plMessages });

    const link = screen.getByRole("link", { name: plMessages.language.switch });
    expect(link).toHaveAttribute("data-locale", "en");
    expect(link).toHaveAttribute("href", "/en/collections");
  });
});
