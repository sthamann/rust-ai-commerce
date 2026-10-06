/** Assign experiments only after current personalization consent; discard stale responses on withdrawal. */
import { useEffect } from "react";
import { shopApi, type Cart } from "../../shared/api/shop-api";
type Experience = { variant: string; headline?: string };
export function useConsentedExperience(
  cart: Cart | undefined,
  adaptation: boolean,
  session: string,
  setExperience: (value: Experience) => void,
) {
  useEffect(() => {
    if (!cart || !adaptation) {
      setExperience({ variant: "discovery" });
      return;
    }
    let active = true;
    void shopApi<{ variant: string; headline?: string }>(
      "/api/experience",
      { session },
      cart.token,
    )
      .then((v) => {
        if (active) setExperience(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [adaptation, cart?.id]);
}
