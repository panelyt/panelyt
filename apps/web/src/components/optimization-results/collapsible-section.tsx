"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  isDark?: boolean;
  /** Badge content to show in the header (e.g., item count) */
  badge?: ReactNode;
  /** Custom header class overrides */
  headerClassName?: string;
  /** Custom content wrapper class overrides */
  contentClassName?: string;
}

export function CollapsibleSection({
  title,
  subtitle,
  icon,
  children,
  defaultExpanded = true,
  isDark = true,
  badge,
  headerClassName,
  contentClassName,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setIsExpanded((prev) => !prev);

  return (
    <div>
      <button
        type="button"
        onClick={toggleExpanded}
        className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition ${
          headerClassName ??
          (isDark
            ? "bg-slate-900/60 hover:bg-slate-900"
            : "bg-slate-50 hover:bg-slate-100")
        }`}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                isDark ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-600"
              }`}
            >
              {icon}
            </span>
          )}
          <div className="flex flex-col">
            <span
              className={`text-sm font-semibold ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {title}
            </span>
            {subtitle && (
              <span
                className={`text-xs ${
                  isDark ? "text-slate-400" : "text-slate-500"
                }`}
              >
                {subtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {badge}
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
              isDark
                ? "bg-slate-800 text-slate-400 hover:text-slate-200"
                : "bg-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className={contentClassName ?? "pt-4"}>{children}</div>
      </div>
    </div>
  );
}

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  isDark?: boolean;
  badge?: ReactNode;
  /** Border color variant */
  variant?: "default" | "warning" | "info";
}

/**
 * A collapsible section with card styling - suitable for standalone sections
 * like price breakdown that need their own visual container.
 */
export function CollapsibleCard({
  title,
  subtitle,
  icon,
  children,
  defaultExpanded = true,
  isDark = true,
  badge,
  variant = "default",
}: CollapsibleCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setIsExpanded((prev) => !prev);

  const borderColors = {
    default: isDark ? "border-slate-800" : "border-slate-200",
    warning: isDark ? "border-amber-500/40" : "border-amber-200",
    info: isDark ? "border-sky-500/40" : "border-sky-200",
  };

  const bgColors = {
    default: isDark ? "bg-slate-900/80" : "bg-white",
    warning: isDark ? "bg-amber-500/10" : "bg-amber-50",
    info: isDark ? "bg-sky-500/10" : "bg-sky-50",
  };

  return (
    <section
      className={`rounded-3xl border p-6 shadow-xl transition-all ${
        borderColors[variant]
      } ${bgColors[variant]} ${isDark ? "shadow-black/30" : ""}`}
    >
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
              }`}
            >
              {icon}
            </span>
          )}
          <div className="flex flex-col gap-1">
            <span
              className={`text-lg font-semibold ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {title}
            </span>
            {subtitle && (
              <span
                className={`text-sm ${
                  isDark ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {subtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {badge}
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
              isDark
                ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            }`}
          >
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </span>
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

/**
 * Badge component for showing counts in collapsible headers
 */
export function CountBadge({
  count,
  label,
  isDark = true,
  variant = "default",
}: {
  count: number;
  label?: string;
  isDark?: boolean;
  variant?: "default" | "warning" | "success";
}) {
  const colors = {
    default: isDark
      ? "bg-slate-700 text-slate-300"
      : "bg-slate-200 text-slate-600",
    warning: isDark
      ? "bg-amber-500/20 text-amber-200"
      : "bg-amber-100 text-amber-700",
    success: isDark
      ? "bg-emerald-500/20 text-emerald-200"
      : "bg-emerald-100 text-emerald-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[variant]}`}
    >
      {count}
      {label && ` ${label}`}
    </span>
  );
}
