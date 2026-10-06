/** Existing sales-channel contract and safe storefront URLs; independent tenants remain a separate concept. */
export type Channel = {
  id: string;
  revision: number;
  data: {
    name: Record<string, string>;
    kind: "storefront" | "headless";
    active: boolean;
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
  return `/?shop=${encodeURIComponent(shop)}&channel=${encodeURIComponent(channel)}#`;
}
