export type AnalyticsPayload = Record<string, unknown>;

type UmamiTracker = {
  track: (eventName: string, payload?: AnalyticsPayload) => void;
};

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
