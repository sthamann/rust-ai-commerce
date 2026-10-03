/** Shared shop text hook; dictionaries live in focused locale files. */
import { useLocale } from "./i18n";
import { de } from "./locales/shop-de";
import { en } from "./locales/shop-en";
import { fr } from "./locales/shop-fr";
import { es } from "./locales/shop-es";
import type { Key } from "./locales/shop-de";
export function useShopText() {
  const context = useLocale();
  const dict =
    context.locale === "de-DE"
      ? de
      : context.locale === "fr-FR"
        ? fr
        : context.locale === "es-ES"
          ? es
          : en;
  return { ...context, s: (key: string) => dict[key as Key] ?? key };
}
