"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { LabChoiceCard } from "./types";

interface LabTabsProps {
  labCards: LabChoiceCard[];
  isDark: boolean;
}

export function LabTabs({ labCards, isDark }: LabTabsProps) {
  const t = useTranslations();
  if (labCards.length === 0) {
    return null;
  }

  const headingId = "best-prices-heading";
  const cardTone = isDark
    ? "border-slate-800 bg-slate-900/70"
    : "border-slate-200 bg-white";

  return (
    <section
      aria-labelledby={headingId}
      role="region"
      className={`rounded-2xl border p-4 shadow-sm ${cardTone}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className={`text-xs font-semibold uppercase tracking-wide ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {t("optimization.bestPrices")}
        </h2>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {labCards.map((card) => (
          <LabSegment key={card.key} card={card} isDark={isDark} />
        ))}
      </div>
    </section>
  );
}

interface LabSegmentProps {
  card: LabChoiceCard;
  isDark: boolean;
}

function LabSegment({ card, isDark }: LabSegmentProps) {
  const t = useTranslations();
  const isActive = card.active;
  const isDisabled = card.disabled || card.loading;
  const isUnavailable = !card.coversAll && card.missing && card.missing.count > 0;
  const hasSavings = Boolean(card.savings && card.savings.amount > 0);
  const hasBonus = Boolean(card.bonus && card.bonus.count > 0);
  const missingCount = card.missing?.count ?? 0;
  const savingsLabel = card.savings?.label ?? "";
  const bonusCount = card.bonus?.count ?? 0;

  const labName = card.shortLabel ?? card.title.replace(/^ONLY\s+/i, "");

  const segmentTone = isDark
    ? "border-slate-800/80 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/60"
    : "border-slate-200 bg-white/70 hover:border-emerald-100 hover:bg-white";

  const activeTone = isDark
    ? "border-emerald-400/70 bg-slate-900 shadow-[0_10px_30px_-18px_rgba(16,185,129,0.65)] ring-1 ring-emerald-300/50"
    : "border-emerald-200 bg-white shadow-[0_10px_30px_-18px_rgba(16,185,129,0.65)] ring-1 ring-emerald-200";

  const labelTone = isActive
    ? isDark
      ? "text-emerald-200"
      : "text-emerald-700"
    : isDark
      ? "text-slate-400"
      : "text-slate-500";

  const priceTone = isActive
    ? isDark
      ? "text-emerald-200"
      : "text-emerald-700"
    : isDark
      ? "text-white"
      : "text-slate-900";

  return (
    <button
      type="button"
      onClick={card.onSelect}
      disabled={isDisabled}
      aria-pressed={isActive}
      className={`group relative flex flex-1 flex-col rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
        isActive ? activeTone : segmentTone
      } ${isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide ${labelTone}`}
          >
            {labName}
          </span>
          {card.meta && (
            <span
              className={`text-[11px] ${
                isDark ? "text-slate-500" : "text-slate-500"
              }`}
            >
              {card.meta}
            </span>
          )}
        </div>

        {isUnavailable ? (
          <span
            className={`text-sm font-medium ${
              isDark ? "text-amber-300" : "text-amber-600"
            }`}
          >
            {t("common.notAvailable")}
          </span>
        ) : (
          <span
            className={`flex items-baseline gap-1 text-lg font-semibold ${priceTone}`}
          >
            {card.loading ? "—" : card.priceLabel}
          </span>
        )}
      </div>

      <div className="mt-3 flex w-full flex-wrap items-center gap-2 text-xs">
        {isUnavailable ? (
          <div
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
              isDark
                ? "border-amber-300/50 bg-amber-500/10 text-amber-200"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>{t("optimization.missingCount", { count: missingCount })}</span>
          </div>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                hasSavings
                  ? isDark
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isDark
                    ? "border-slate-700 bg-slate-800 text-slate-400"
                    : "border-slate-200 bg-slate-100 text-slate-500"
              }`}
            >
              {hasSavings
                ? t("optimization.saveLabel", { amount: savingsLabel })
                : t("optimization.noSavings")}
            </span>

            {hasBonus && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                  isDark
                    ? "border-slate-700 bg-slate-900 text-slate-300"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {t("optimization.bonusCountShort", { count: bonusCount })}
              </span>
            )}
          </>
        )}
      </div>
    </button>
  );
}
