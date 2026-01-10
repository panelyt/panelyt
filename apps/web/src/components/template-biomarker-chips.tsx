"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

type BiomarkerChip = {
  code: string;
  display_name: string;
};

interface TemplateBiomarkerChipsProps {
  biomarkers: BiomarkerChip[];
  className?: string;
}

const MOBILE_MAX = 4;
const DESKTOP_MAX = 6;

export function TemplateBiomarkerChips({
  biomarkers,
  className,
}: TemplateBiomarkerChipsProps) {
  const t = useTranslations();
  const [isDesktop, setIsDesktop] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  const maxVisible = isDesktop ? DESKTOP_MAX : MOBILE_MAX;
  const hasOverflow = biomarkers.length > maxVisible;
  const visibleBiomarkers = expanded || !hasOverflow
    ? biomarkers
    : biomarkers.slice(0, maxVisible);
  const hiddenCount = hasOverflow ? biomarkers.length - maxVisible : 0;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visibleBiomarkers.map((biomarker) => (
        <span
          key={biomarker.code}
          className="inline-flex items-center rounded-pill border border-border/70 bg-surface-2 px-3 py-1 text-xs text-primary"
        >
          {biomarker.display_name}
        </span>
      ))}
      {hasOverflow ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center rounded-pill border border-border/70 bg-surface-2 px-3 py-1 text-xs font-semibold text-secondary transition hover:text-primary focus-ring"
        >
          {expanded
            ? t("collections.collapseChips")
            : t("collections.moreBiomarkers", { count: hiddenCount })}
        </button>
      ) : null}
    </div>
  );
}
