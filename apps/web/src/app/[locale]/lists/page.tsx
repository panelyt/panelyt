import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import ListsContent from "./lists-content";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("listsTitle"),
    description: t("listsDescription"),
    alternates: {
      canonical: locale === "pl" ? "/lists" : "/en/lists",
      languages: {
        pl: "/lists",
        en: "/en/lists",
      },
    },
    openGraph: {
      title: t("listsTitle"),
      description: t("listsDescription"),
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}

export default function Page() {
  return <ListsContent />;
}
