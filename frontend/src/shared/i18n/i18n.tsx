/** i18n: Four-language locale context, UI dictionaries and translated API errors. */
import { en } from "./locales/en";
import { de } from "./locales/de";
import { fr } from "./locales/fr";
import { es } from "./locales/es";
import type { Key, Dictionary } from "./locales/en";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export const locales = {
  "de-DE": "Deutsch",
  "en-GB": "English",
  "fr-FR": "Français",
  "es-ES": "Español",
} as const;
export type Locale = keyof typeof locales;
export const dictionaries: Record<Locale, Dictionary> = {
  "de-DE": de,
  "en-GB": en,
  "fr-FR": fr,
  "es-ES": es,
};
export function getLocale(): Locale {
  const requested = new URLSearchParams(location.search).get("language");
  if (requested && requested in locales) return requested as Locale;
  const saved = localStorage.getItem("rac-locale");
  return saved && saved in locales ? (saved as Locale) : "de-DE";
}
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
}>({ locale: "de-DE", setLocale: () => {} });
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<Locale>(getLocale);
  const setLocale = (l: Locale) => {
    localStorage.setItem("rac-locale", l);
    if (location.pathname.startsWith("/products/")) {
      const url = new URL(location.href);
      url.searchParams.set("language", l);
      history.replaceState(null, "", url);
    }
    set(l);
  };
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
export const CurrencyContext = createContext("EUR");
export function useLocale() {
  const currency = useContext(CurrencyContext);
  const { locale, setLocale } = useContext(LocaleContext);
  return {
    locale,
    currency,
    setLocale,
    t: (key: Key, values: Record<string, string | number> = {}) =>
      Object.entries(values).reduce(
        (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
        dictionaries[locale][key],
      ),
    money: (n: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(n),
    number: (n: number) => new Intl.NumberFormat(locale).format(n),
    date: (s: string) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(s)),
  };
}
