/** Shared app discovery metadata, safe artwork sources and localized search independent of rendering. */
import type { Package } from "./app-types";
import type { IconName } from "../../shared/ui/Icon";
import type { LibraryKey } from "../../shared/i18n/app-library-i18n";
import { contentText } from "../../shared/i18n/content-language";
export const categories = [
  "all",
  "commerce",
  "payment",
  "api",
  "ai",
  "design",
  "operations",
] as const;
export const builtIns = [
  {
    id: "engraving",
    name: "Product personalization",
    category: "commerce",
    icon: "spark",
  },
  { id: "paypal", name: "PayPal", category: "payment", icon: "card" },
  {
    id: "shopware_payments",
    name: "Shopware Payments",
    category: "payment",
    icon: "card",
  },
  { id: "storyfront", name: "Storyfront", category: "design", icon: "layers" },
  {
    id: "google_analytics",
    name: "Google Analytics",
    category: "operations",
    icon: "pulse",
  },
  { id: "gmail", name: "Gmail", category: "ai", icon: "chat" },
  { id: "slack", name: "Slack", category: "operations", icon: "people" },
  { id: "email", name: "Email", category: "operations", icon: "send" },
] as const;
export function appCategory(p: Package) {
  return (
    p.manifest.category ??
    builtIns.find((b) => b.id === p.id)?.category ??
    "commerce"
  );
}
export function appName(p: Package, locale: string, mainLocale = "en-GB") {
  return contentText(p.manifest.name, locale, mainLocale) || p.id;
}
export function descriptionKey(id: string): LibraryKey {
  return builtIns.some((b) => b.id === id)
    ? (id as LibraryKey)
    : id.startsWith("care")
      ? "care"
      : "generic";
}
export function appSummary(
  p: Package,
  locale: string,
  mainLocale: string,
  text: (k: LibraryKey) => string,
) {
  const map = p.manifest.presentation?.description;
  return map
    ? contentText(map, locale, mainLocale)
    : text(descriptionKey(p.id));
}
export function appIcon(id: string, category: string): IconName {
  return (
    builtIns.find((b) => b.id === id)?.icon ??
    (
      {
        payment: "card",
        ai: "spark",
        api: "code",
        design: "layers",
        operations: "settings",
      } as Record<string, IconName>
    )[category] ??
    "box"
  );
}
export function artworkSource(source?: string) {
  if (!source || source.length > 2048) return undefined;
  if (
    /^\/(media|assets)\/[a-zA-Z0-9/._-]+$/.test(source) &&
    !source.includes("..")
  )
    return source;
  try {
    const u = new URL(source);
    if (u.protocol === "https:" && !u.username && !u.password) return source;
  } catch {
    /* Invalid artwork falls back to the deterministic local illustration. */
  }
  return undefined;
}
export function matchesApp(
  p: Package,
  query: string,
  category: string,
  state: string,
  locale: string,
  mainLocale: string,
  text: (k: LibraryKey) => string,
) {
  return (
    (category === "all" || appCategory(p) === category) &&
    (state === "all" || (state === "enabled") === p.active) &&
    [
      p.id,
      appName(p, locale, mainLocale),
      appSummary(p, locale, mainLocale, text),
      ...Object.values(p.manifest.name),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
}
