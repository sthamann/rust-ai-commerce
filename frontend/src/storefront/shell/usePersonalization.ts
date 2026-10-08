/** Opt-in behavior signals and stable product ordering; no authoritative prices are changed. */
import { channelPreview } from "./ChannelPreview";
import { usePurpose } from "../../shared/legal/consent-store";
import { useEffect, useState } from "react";
import { shopApi, type Cart, type Product } from "../../shared/api/shop-api";
export function usePersonalization(
  products: Product[],
  cart: Cart | undefined,
  id: string,
  _shopTenant: string,
) {
  const [ranked, setRanked] = useState<string[]>([]);
  const [personalized, setPersonalized] = useState(false);
  const adaptation = usePurpose("personalization") && !channelPreview();
  const [viewed, setViewed] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!adaptation || !cart || !id) return;
    let active = true;
    shopApi<{ rankedProductIds: string[]; adapted: boolean }>(
      "/store-api/personalization/events",
      {
        productId: id,
        eventId: crypto.randomUUID().replaceAll("-", ""),
        kind: "view",
      },
      cart.token,
    )
      .then((v) => {
        if (active) {
          setRanked(v.rankedProductIds);
          setPersonalized(v.adapted);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, adaptation, cart?.id]);
  useEffect(() => {
    if (!adaptation) {
      setRanked([]);
      setPersonalized(false);
      setViewed({});
    }
  }, [adaptation]);
  const affinity = Object.entries(viewed).sort((a, b) => b[1] - a[1])[0];
  const adapted =
    adaptation && (personalized || (!!affinity && affinity[1] >= 3));
  const rank = (id: string) => {
    const index = ranked.indexOf(id);
    return index < 0 ? ranked.length : index;
  };
  const list = [...products].sort((a, b) =>
    adaptation && ranked.length
      ? rank(a.id) - rank(b.id)
      : adapted && affinity
        ? Number(b.category === affinity[0]) -
          Number(a.category === affinity[0])
        : 0,
  );
  return {
    ranked,
    setRanked,
    personalized,
    setPersonalized,
    adaptation,
    viewed,
    setViewed,
    affinity,
    adapted,
    rank,
    list,
  };
}
