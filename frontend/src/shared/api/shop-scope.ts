/** Canonical browser shop scope for storefront URLs and tenant-isolated customer storage. */
export function hostnameShop(): string | undefined {
  const host = location.hostname;
  if (!host.endsWith(".vendune.ai")) return undefined;
  const shop = host.slice(0, -".vendune.ai".length);
  return ["app", "www"].includes(shop) ? undefined : shop;
}
export function shopScope(): string {
  return (
    hostnameShop() ??
    new URLSearchParams(location.search).get("shop") ??
    "atelier"
  );
}
export function storefrontURL(id: string, studio = false): string {
  const path = `/?shop=${encodeURIComponent(id)}${studio ? "#merchant" : ""}`;
  return !studio &&
    (location.hostname === "vendune.ai" ||
      location.hostname.endsWith(".vendune.ai"))
    ? `https://${id}.vendune.ai/`
    : path;
}
