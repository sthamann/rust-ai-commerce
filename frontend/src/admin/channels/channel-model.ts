/** Existing sales-channel contract and safe storefront URLs; independent tenants remain a separate concept. */
import { storefrontURL } from "../../shared/api/shop-scope";
export type Channel = {
  id: string;
  revision: number;
  data: {
    name: Record<string, string>;
    kind: "storefront" | "headless";
    active: boolean;
    visibility?: "public" | "private";
    locales: string[];
    productIds: string[];
    navigationCategoryId?: string | null;
  };
};
export const freshChannel = (mainLocale: string): Channel => ({
  id: `shop_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
  revision: 0,
  data: {
    name: {},
    kind: "storefront",
    active: true,
    locales: [mainLocale],
    productIds: [],
    navigationCategoryId: null,
  },
});
export function channelUrl(shop: string, channel: string) {
  const publicOrigin = location.hostname.endsWith(".vendune.ai")
    ? "https://app.vendune.ai"
    : location.origin;
  const url = new URL(
    channel === "default"
      ? storefrontURL(shop)
      : `/?shop=${encodeURIComponent(shop)}`,
    channel === "default" ? location.origin : publicOrigin,
  );
  url.searchParams.set("channel", channel);
  return url.origin === location.origin
    ? `${url.pathname}${url.search}#`
    : `${url.href}#`;
}
