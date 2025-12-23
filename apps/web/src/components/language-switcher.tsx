"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("language");

  const otherLocale = locale === "pl" ? "en" : "pl";
  const pathname = usePathname();

  return (
    <Link
      href={pathname}
      locale={otherLocale}
      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200"
    >
      {t("switch")}
    </Link>
  );
}
