export type LocalizedTemplateText = {
  name_en: string;
  name_pl: string;
  description_en?: string | null;
  description_pl?: string | null;
};

export function getTemplateName(template: LocalizedTemplateText, locale: string): string {
  return locale === "pl" ? template.name_pl : template.name_en;
}

export function getTemplateDescription(
  template: LocalizedTemplateText,
  locale: string,
): string | null {
  return locale === "pl"
    ? template.description_pl ?? null
    : template.description_en ?? null;
}
