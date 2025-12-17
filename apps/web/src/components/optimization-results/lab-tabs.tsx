import { Check, AlertTriangle } from "lucide-react";

import type { LabChoiceCard } from "./types";

interface LabTabsProps {
  labCards: LabChoiceCard[];
  isDark: boolean;
}

export function LabTabs({ labCards, isDark }: LabTabsProps) {
  if (labCards.length === 0) {
    return null;
  }

  return (
    <section
      className={`rounded-2xl border p-4 ${
        isDark
          ? "border-slate-800 bg-slate-900/80"
          : "border-slate-200 bg-white"
      }`}
    >
      <h2
        className={`text-sm font-semibold uppercase tracking-wide ${
          isDark ? "text-slate-400" : "text-slate-500"
        }`}
      >
        Best prices
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {labCards.map((card) => (
          <LabTab key={card.key} card={card} isDark={isDark} />
        ))}
      </div>
    </section>
  );
}

interface LabTabProps {
  card: LabChoiceCard;
  isDark: boolean;
}

function LabTab({ card, isDark }: LabTabProps) {
  const isActive = card.active;
  const isDisabled = card.disabled || card.loading;
  const isUnavailable = !card.coversAll && card.missing && card.missing.count > 0;

  // Extract lab name from title (remove "ONLY " prefix if present)
  const labName = card.title.replace(/^ONLY\s+/i, "");

  return (
    <button
      type="button"
      onClick={card.onSelect}
      disabled={isDisabled}
      className={`group relative flex flex-col rounded-xl border p-4 text-left transition ${
        isDark
          ? `${
              isActive
                ? "border-emerald-400/80 bg-slate-800/80"
                : "border-slate-700 bg-slate-900/60 hover:border-emerald-300/50 hover:bg-slate-800/60"
            }`
          : `${
              isActive
                ? "border-emerald-400 bg-emerald-50/50"
                : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/30"
            }`
      } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {/* Active indicator */}
      {isActive && (
        <span
          className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full ${
            isDark ? "bg-emerald-500 text-white" : "bg-emerald-500 text-white"
          }`}
        >
          <Check className="h-3 w-3" />
        </span>
      )}

      {/* Lab name */}
      <span
        className={`text-xs font-semibold uppercase tracking-wide ${
          isDark ? "text-slate-400" : "text-slate-500"
        }`}
      >
        {labName}
      </span>

      {/* Price or unavailable state */}
      {isUnavailable ? (
        <div className="mt-2">
          <span
            className={`text-sm font-medium ${
              isDark ? "text-amber-300" : "text-amber-600"
            }`}
          >
            unavailable
          </span>
          <div
            className={`mt-1 flex items-center gap-1 text-xs ${
              isDark ? "text-amber-300/80" : "text-amber-600/80"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>missing {card.missing?.count}</span>
          </div>
        </div>
      ) : (
        <>
          {/* Price */}
          <span
            className={`mt-2 text-2xl font-semibold ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            {card.loading ? "—" : card.priceLabel}
          </span>

          {/* Savings */}
          {card.savings && card.savings.amount > 0 && (
            <span
              className={`mt-1 text-sm ${
                isDark ? "text-emerald-300" : "text-emerald-600"
              }`}
            >
              ↓{card.savings.label} saved
            </span>
          )}

          {/* Bonus */}
          {card.bonus && card.bonus.count > 0 && (
            <span
              className={`mt-1 text-xs ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              +{card.bonus.count} bonus
            </span>
          )}
        </>
      )}

      {/* Cheapest badge */}
      {card.badge && (
        <span
          className={`mt-2 inline-flex self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isDark
              ? "bg-emerald-500/20 text-emerald-200"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {card.badge}
        </span>
      )}
    </button>
  );
}
