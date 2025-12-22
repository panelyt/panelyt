"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("language");

  const otherLocale = locale === "pl" ? "en" : "pl";

  // Build path for other locale
  let otherPath: string;
  if (locale === "pl") {
    // Currently Polish (no prefix), add /en prefix
    otherPath = `/en${pathname}`;
  } else {
    // Currently English (/en prefix), remove it
    otherPath = pathname.replace(/^\/en/, "") || "/";
  }

  return (
    <Link
      href={otherPath}
      hrefLang={otherLocale}
      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200"
    >
      {t("switch")}
    </Link>
  );
}
