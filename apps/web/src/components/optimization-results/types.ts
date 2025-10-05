import type { ReactNode } from "react";

export interface LabChoiceCard {
  key: string;
  title: string;
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
}
