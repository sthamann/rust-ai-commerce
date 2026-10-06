/** Revalidate visible Studio sessions and route authenticated failures to the active controller. */
import { useEffect } from "react";
import { onMerchantSessionFailure } from "../../shared/api/merchant-session";
import type { RequestFn } from "./studio-types";

export function useStudioSession(
  token: string,
  connected: boolean,
  liveRequest: RequestFn,
  onInvalid: (detail: string) => void,
) {
  useEffect(() => {
    if (!token) return;
    let active = true;
    let pending = false;
    const unsubscribe = onMerchantSessionFailure((failure) => {
      // An old request must never log out a newly established session.
      if (active && failure.token === token) onInvalid(failure.detail);
    });
    const validate = () => {
      if (!connected || document.visibilityState === "hidden" || pending)
        return;
      pending = true;
      void liveRequest("/api/auth/session")
        .catch(() => {}) // Network/permission failures do not invalidate identity.
        .finally(() => {
          pending = false;
        });
    };
    window.addEventListener("focus", validate);
    document.addEventListener("visibilitychange", validate);
    const timer = connected ? window.setInterval(validate, 60_000) : undefined;
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", validate);
      document.removeEventListener("visibilitychange", validate);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [token, connected, liveRequest, onInvalid]);
}
