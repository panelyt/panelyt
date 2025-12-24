import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import PrivacyContent from "./privacy-content";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: locale === "pl" ? "/privacy" : "/en/privacy",
      languages: {
        pl: "/privacy",
        en: "/en/privacy",
        "x-default": "/privacy",
      },
    },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}

export default function Page() {
  return <PrivacyContent />;
}
