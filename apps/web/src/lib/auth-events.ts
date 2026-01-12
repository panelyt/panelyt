export const AUTH_REQUIRED_EVENT = "panelyt:auth-required";

export function requestAuthModal() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
}
