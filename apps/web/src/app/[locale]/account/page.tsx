import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import AccountContent from "./account-content";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("accountTitle"),
    description: t("accountDescription"),
    alternates: {
      canonical: locale === "pl" ? "/account" : "/en/account",
      languages: {
        pl: "/account",
        en: "/en/account",
        "x-default": "/account",
      },
    },
    openGraph: {
      title: t("accountTitle"),
      description: t("accountDescription"),
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}

export default function Page() {
  return <AccountContent />;
}
