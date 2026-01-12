const relativeRanges: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
  { unit: "second", ms: 1000 },
];

type ResolvedTimestamp = {
  date: Date;
  timestamp: number;
};

export const resolveTimestamp = (value: string): ResolvedTimestamp | null => {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return { date, timestamp };
};

export const formatRelativeTimestamp = (
  timestamp: number,
  formatter: Intl.RelativeTimeFormat,
  now = Date.now(),
) => {
  const diff = timestamp - now;
  for (const range of relativeRanges) {
    if (Math.abs(diff) >= range.ms || range.unit === "second") {
      return formatter.format(Math.round(diff / range.ms), range.unit);
    }
  }
  return formatter.format(0, "second");
};

export const formatExactTimestamp = (
  date: Date,
  formatter: Intl.DateTimeFormat,
) => formatter.format(date);
