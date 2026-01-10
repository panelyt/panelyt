export type AnalyticsPayload = Record<string, unknown>;

type UmamiTracker = {
  track: (eventName: string, payload?: AnalyticsPayload) => void;
};

let ttorStartAt: number | null = null;

export function track(eventName: string, payload?: AnalyticsPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const umami = (window as Window & { umami?: UmamiTracker }).umami;
  if (!umami?.track) {
    return;
  }

  if (payload && Object.keys(payload).length > 0) {
    umami.track(eventName, payload);
  } else {
    umami.track(eventName);
  }
}

export function markTtorStart() {
  if (typeof window === "undefined") {
    return;
  }
  if (ttorStartAt === null) {
    ttorStartAt = Date.now();
  }
}

export function resetTtorStart() {
  ttorStartAt = null;
}

export function consumeTtorDuration(): number | null {
  if (ttorStartAt === null) {
    return null;
  }
  const duration = Math.max(0, Date.now() - ttorStartAt);
  ttorStartAt = null;
  return duration;
}
