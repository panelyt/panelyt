import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { SavedListSchema } from "@panelyt/types";

import { getParsedJson } from "../../../../../lib/http";
import SharedContent from "./shared-content";

interface PageProps {
  params: Promise<{ locale: string; shareToken: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, shareToken } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  let listName = shareToken;
  try {
    const sharedList = await getParsedJson(
      `/biomarker-lists/shared/${shareToken}`,
      SavedListSchema,
    );
    listName = sharedList.name;
  } catch {
    // Fall back to the share token if the fetch fails
  }

  const title = t("sharedListTitle", { name: listName });
  const description = t("sharedListDescription", { name: listName });
  const path = `/collections/shared/${shareToken}`;

  return {
    title,
    description,
    alternates: {
      canonical: locale === "pl" ? path : `/en${path}`,
      languages: {
        pl: path,
        en: `/en${path}`,
        "x-default": path,
      },
    },
    openGraph: {
      title,
      description,
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { shareToken } = await params;
  return <SharedContent shareToken={shareToken} />;
}
