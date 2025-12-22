import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import Home from "./home-content";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: locale === "pl" ? "/" : "/en",
      languages: {
        pl: "/",
        en: "/en",
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://panelyt.com";

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Panelyt",
    url: BASE_URL,
    description: t("description"),
    inLanguage: locale === "pl" ? "pl-PL" : "en-US",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Home />
    </>
  );
}
