"use client";

import { useTranslations } from "next-intl";

import { Header } from "../../../components/header";

export default function PrivacyContent() {
  const t = useTranslations("privacy");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <section className="pb-16 pt-8">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {t("lastUpdated", { date: "December 2025" })}
          </p>

          <div className="mt-8 space-y-8 text-slate-300">
            <p>{t("intro")}</p>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("analyticsTitle")}</h2>
              <p className="mt-2">{t("analyticsText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("accountDataTitle")}</h2>
              <p className="mt-2">{t("accountDataText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("savedListsTitle")}</h2>
              <p className="mt-2">{t("savedListsText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("telegramTitle")}</h2>
              <p className="mt-2">{t("telegramText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("dataRetentionTitle")}</h2>
              <p className="mt-2">{t("dataRetentionText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("thirdPartiesTitle")}</h2>
              <p className="mt-2">{t("thirdPartiesText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("yourRightsTitle")}</h2>
              <p className="mt-2">{t("yourRightsText")}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">{t("contactTitle")}</h2>
              <p className="mt-2">
                {t.rich("contactText", {
                  email: (chunks) => (
                    <a
                      href="mailto:contact@panelyt.com"
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      {chunks}
                    </a>
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
