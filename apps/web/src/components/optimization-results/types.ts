import type { ReactNode } from "react";

export interface LabChoiceCard {
  key: string;
  title: string;
  shortLabel?: string;
  priceLabel: string;
  priceValue?: number | null;
  meta?: string;
  badge?: string;
  active: boolean;
  loading?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
  /** Structured data for compact display */
  savings?: {
    amount: number;
    label: string;
  };
  bonus?: {
    count: number;
    valueLabel?: string;
  };
  missing?: {
    count: number;
    tokens?: string[];
  };
  /** Whether this lab can cover all selected biomarkers */
  coversAll?: boolean;
}
