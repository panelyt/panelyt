"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { LabChoiceCard } from "./types";
import { SegmentedControl } from "../../ui/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

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
  const activeKey = labCards.find((card) => card.active)?.key ?? labCards[0]?.key ?? "";
  const options = labCards.map((card) => ({
    value: card.key,
    label: <LabSegmentLabel card={card} isDark={isDark} />,
    disabled: card.disabled || card.loading,
  }));

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
      <div className="mt-3">
        <TooltipProvider delayDuration={0}>
          <SegmentedControl
            value={activeKey}
            onValueChange={(value) => {
              const selectedCard = labCards.find((card) => card.key === value);
              selectedCard?.onSelect();
            }}
            ariaLabel={t("optimization.bestPrices")}
            unstyled
            options={options}
            className={[
              "flex w-full flex-wrap gap-2 rounded-2xl border-0 bg-surface-1/80 p-1",
              "[&>button]:flex [&>button]:min-w-[190px] [&>button]:flex-1 [&>button]:min-h-[104px] [&>button]:items-stretch",
              "[&>button]:justify-between [&>button]:gap-3 [&>button]:px-4 [&>button]:py-3",
              "[&>button]:text-left [&>button]:shadow-none [&>button]:transition",
              "[&>button]:focus-ring [&>button]:normal-case",
              "[&>button]:rounded-2xl",
              "[&>button]:bg-surface-1/70 [&>button]:hover:bg-surface-2/70",
              "[&>button[aria-selected=true]]:ring-1 [&>button[aria-selected=true]]:ring-accent-cyan/40",
            ].join(" ")}
          />
        </TooltipProvider>
      </div>
    </section>
  );
}

interface LabSegmentProps {
  card: LabChoiceCard;
  isDark: boolean;
}

function LabSegmentLabel({ card, isDark }: LabSegmentProps) {
  const t = useTranslations();
  const placeholderDash = t("common.placeholderDash");
  const isActive = card.active;
  const isUnavailable = !card.coversAll && card.missing && card.missing.count > 0;
  const hasSavings = Boolean(card.savings && card.savings.amount > 0);
  const hasBonus = Boolean(card.bonus && card.bonus.count > 0);
  const missingCount = card.missing?.count ?? 0;
  const savingsLabel = card.savings?.label ?? "";
  const bonusCount = card.bonus?.count ?? 0;
  const bonusValue = card.bonus?.valueLabel;
  const missingTokens = card.missing?.tokens ?? [];
  const hasMissingTokens = missingTokens.length > 0;

  const labName = card.shortLabel ?? card.title.replace(/^ONLY\s+/i, "");

  const labelTone = isDark ? "text-slate-400" : "text-slate-500";

  const priceTone = isDark ? "text-white" : "text-slate-900";

  const metaTone = isDark ? "text-slate-500" : "text-slate-400";

  const badgeTone = "bg-surface-2 text-secondary";

  const missingChip = (
    <span
      className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-medium normal-case ${
        isDark
          ? "border-amber-300/40 bg-amber-500/10 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      <AlertTriangle className="h-3 w-3" />
      <span>{t("optimization.missingCount", { count: missingCount })}</span>
    </span>
  );

  return (
    <div className="flex h-full w-full flex-col text-left normal-case">
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${labelTone}`}>
          {labName}
        </span>
        {card.badge && (
          <span
            className={`inline-flex items-center rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badgeTone}`}
          >
            {card.badge}
          </span>
        )}
      </div>

      <div className="mt-2 flex w-full justify-end">
        {isUnavailable ? (
          <span
            className={`text-lg font-semibold ${
              isDark ? "text-amber-200" : "text-amber-600"
            }`}
          >
            {t("common.notAvailable")}
          </span>
        ) : (
          <span className={`text-lg font-semibold ${priceTone}`}>
            {card.loading ? placeholderDash : card.priceLabel}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {isUnavailable ? (
          hasMissingTokens ? (
            <Tooltip>
              <TooltipTrigger asChild>{missingChip}</TooltipTrigger>
              <TooltipContent>
                <p className={`text-[10px] uppercase tracking-wide ${metaTone}`}>
                  {t("optimization.missingTokensLabel")}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[11px] text-primary">
                  {missingTokens.map((token) => (
                    <span key={token} className="rounded-pill bg-surface-1 px-2 py-0.5">
                      {token}
                    </span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            missingChip
          )
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-medium normal-case ${
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
                className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-medium normal-case ${
                  isDark
                    ? "border-slate-700 bg-slate-900 text-slate-300"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {bonusValue
                  ? t("optimization.bonusShortWithValue", {
                      count: bonusCount,
                      value: bonusValue,
                    })
                  : t("optimization.bonusShort", { count: bonusCount })}
              </span>
            )}

            {card.missing && card.missing.count > 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-medium normal-case ${
                  isDark
                    ? "border-amber-300/40 bg-amber-500/10 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {t("optimization.missingCount", { count: missingCount })}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
