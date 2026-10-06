/** Canonical shop hosts; Studio identity remains on the shared origin. Reserved service hosts never become tenant IDs. */
const reserved = [
  "app",
  "www",
  "admin",
  "api",
  "platform",
  "mail",
  "experience",
];
export function validShopId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/.test(id) && !reserved.includes(id);
}
export function hostnameShop(): string | undefined {
  const host = location.hostname;
  if (!host.endsWith(".vendune.ai")) return undefined;
  const shop = host.slice(0, -".vendune.ai".length);
  return validShopId(shop) ? shop : undefined;
}
export function shopScope(): string {
  return (
    hostnameShop() ??
    new URLSearchParams(location.search).get("shop") ??
    "nord-atelier"
  );
}
export function storefrontURL(id: string, studio = false): string {
  const publicHost =
    location.hostname === "vendune.ai" ||
    location.hostname.endsWith(".vendune.ai");
  const path = `/?shop=${encodeURIComponent(id)}${studio ? "#merchant" : ""}`;
  if (!publicHost || !validShopId(id)) return path;
  return studio ? `https://app.vendune.ai${path}` : `https://${id}.vendune.ai/`;
}
/** Upgrade legacy shared-origin storefront bookmarks without moving login, Studio or private staging sessions. */
export function canonicalShopURL(url: URL): string | undefined {
  if (
    !["app.vendune.ai", "vendune.ai", "www.vendune.ai"].includes(url.hostname)
  )
    return;
  const id = url.searchParams.get("shop");
  if (
    !id ||
    !validShopId(id) ||
    url.searchParams.has("sandbox") ||
    ["#merchant", "#studio-content", "#login", "#platform"].includes(url.hash)
  )
    return;
  const target = new URL(url.href);
  target.hostname = `${id}.vendune.ai`;
  target.searchParams.delete("shop");
  target.searchParams.delete("studio");
  return target.href;
}
