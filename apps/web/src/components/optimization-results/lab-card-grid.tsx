import { useTranslations } from "next-intl";

import type { LabChoiceCard } from "./types";

interface LabCardGridProps {
  labCards: LabChoiceCard[];
  isDark: boolean;
}

export function LabCardGrid({ labCards, isDark }: LabCardGridProps) {
  const t = useTranslations();
  const placeholderDash = t("common.placeholderDash");
  if (labCards.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
      {labCards.map((card) => {
        const isActive = card.active;
        const isDisabled = card.disabled || card.loading;

        return (
          <button
            key={card.key}
            type="button"
            onClick={card.onSelect}
            disabled={isDisabled}
            className={`group flex h-full flex-col rounded-2xl border px-4 py-5 text-left transition ${
              isDark
                ? `bg-slate-950/60 ${
                    isActive
                      ? "border-emerald-400/80 shadow-lg shadow-emerald-500/10"
                      : "border-slate-800 hover:border-emerald-300/70 hover:bg-slate-900"
                  }`
                : `bg-slate-50 ${
                    isActive
                      ? "border-emerald-300 shadow-lg shadow-emerald-200/40"
                      : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60"
                  }`
            } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <div className="flex h-full flex-col justify-between gap-4">
              <div
                className={`flex items-center gap-3 text-sm ${
                  isDark ? "text-slate-400" : "text-slate-500"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    isDark ? card.accentDark : card.accentLight
                  }`}
                >
                  {card.icon}
                </span>
                <span
                  className={`font-semibold uppercase tracking-wide text-[11px] ${
                    isDark ? "text-slate-200" : ""
                  }`}
                >
                  {card.title}
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-between">
                <div className="flex items-center gap-2">
                  <p
                    className={`text-2xl font-semibold ${
                      isDark ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {card.loading ? placeholderDash : card.priceLabel}
                  </p>
                  {card.badge && (
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        isDark
                          ? "bg-slate-800 text-emerald-200"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {card.badge}
                    </span>
                  )}
                </div>
                <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {card.meta ? card.meta : <span className="invisible">{placeholderDash}</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
