import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import CollectionsContent from "./collections-content";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("templatesTitle"),
    description: t("templatesDescription"),
    alternates: {
      canonical: locale === "pl" ? "/collections" : "/en/collections",
      languages: {
        pl: "/collections",
        en: "/en/collections",
        "x-default": "/collections",
      },
    },
    openGraph: {
      title: t("templatesTitle"),
      description: t("templatesDescription"),
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}

export default function Page() {
  return <CollectionsContent />;
}
