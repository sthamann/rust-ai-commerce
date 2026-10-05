/** Channel-scoped public brand/legal identity; stale responses cannot leak across tenants or languages. */
import { useEffect, useState } from "react";
import { shopApi, getContentLocale } from "../../shared/api/shop-api";
export function useCompanyIdentity(
  shop: string,
  channel: string,
  locale: string,
) {
  const [company, setCompany] = useState<Record<string, string>>({});
  const language = getContentLocale();
  useEffect(() => {
    let active = true;
    setCompany({});
    shopApi<{ data: Record<string, string> }>("/store-api/company")
      .then(async (v) => {
        if (
          new URLSearchParams(location.search).get("sandbox") === "1" &&
          v.data.logoId
        ) {
          try {
            const image = await shopApi<{ dataUrl: string }>(
              `/api/settings/company-logo/${v.data.logoId}`,
            );
            v.data.logoUrl = image.dataUrl;
          } catch {
            delete v.data.logoUrl;
          }
        }
        if (active) setCompany(v.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [shop, channel, locale, language]);
  return company;
}
