/** Stable, collision-free product addresses: SKU identity plus the inherited localized SEO slug. */
import { getContentLocale, type Product } from "../../shared/api/shop-api";
import { hostnameShop, shopScope } from "../../shared/api/shop-scope";
export function productURL(product: Pick<Product, "id" | "extra">): string {
  const locale = getContentLocale();
  const seo = product.extra?.seo;
  const slug = seo?.[locale]?.slug ?? seo?.[locale.split("-")[0]]?.slug;
  const query = new URLSearchParams(location.search);
  query.delete("studio");
  if (!hostnameShop()) query.set("shop", shopScope());
  query.set("language", locale);
  const path = `/products/${encodeURIComponent(product.id)}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
  return `${path}?${query}`;
}
export function routeProductId(url: URL): string {
  try {
    if (url.hash.startsWith("#product/"))
      return decodeURIComponent(url.hash.slice(9));
    if (url.hash && url.hash !== "#") return "";
    const match = /^\/products\/([^/]+)(?:\/[^/]+)?\/?$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
export function collectionURL(): string {
  return `/${location.search}#`;
}
