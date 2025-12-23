import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { BiomarkerListTemplateSchema } from "@panelyt/types";

import { getParsedJson } from "../../../../lib/http";
import TemplateDetailContent from "./template-detail-content";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  let templateName = slug;
  try {
    const template = await getParsedJson(
      `/biomarker-lists/templates/${slug}`,
      BiomarkerListTemplateSchema,
    );
    templateName = template.name;
  } catch {
    // Use slug as fallback if template fetch fails
  }

  const title = t("templateDetailTitle", { name: templateName });
  const description = t("templateDetailDescription", { name: templateName });
  const path = `/collections/${slug}`;

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

export default function Page({ params }: PageProps) {
  return <TemplateDetailContent params={params} />;
}
