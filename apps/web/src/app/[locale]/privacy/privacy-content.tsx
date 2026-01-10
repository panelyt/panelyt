"use client";

import { useTranslations } from "next-intl";

import { Header } from "../../../components/header";

export default function PrivacyContent() {
  const t = useTranslations("privacy");

  return (
    <main className="min-h-screen bg-app text-primary">
      <Header />

      <section className="pb-16 pt-8">
        <div className="mx-auto max-w-2xl px-6">
          <h1 className="text-3xl font-semibold text-primary">{t("title")}</h1>
          <p className="mt-2 text-sm text-secondary">
            {t("lastUpdated", { date: "December 2025" })}
          </p>

          <div className="mt-8 space-y-6 text-sm text-secondary">
            <p className="leading-relaxed">{t("intro")}</p>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("analyticsTitle")}
              </h2>
              <p className="leading-relaxed">{t("analyticsText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("accountDataTitle")}
              </h2>
              <p className="leading-relaxed">{t("accountDataText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("savedListsTitle")}
              </h2>
              <p className="leading-relaxed">{t("savedListsText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("telegramTitle")}
              </h2>
              <p className="leading-relaxed">{t("telegramText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("dataRetentionTitle")}
              </h2>
              <p className="leading-relaxed">{t("dataRetentionText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("thirdPartiesTitle")}
              </h2>
              <p className="leading-relaxed">{t("thirdPartiesText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("yourRightsTitle")}
              </h2>
              <p className="leading-relaxed">{t("yourRightsText")}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-primary">
                {t("contactTitle")}
              </h2>
              <p className="leading-relaxed">
                {t.rich("contactText", {
                  email: (chunks) => (
                    <a href="mailto:contact@panelyt.com">{chunks}</a>
                  ),
                })}
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
