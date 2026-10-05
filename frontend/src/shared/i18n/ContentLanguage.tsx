/** One content-language selection per editor, distinct from interface language; no writes on selection or fallback. */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocale } from "./i18n";
type Scope = {
  locales: string[];
  mainLocale: string;
  language: string;
  select: (language: string) => void;
};
const ContentLanguageContext = createContext<Scope | null>(null);
export function ContentLanguage({
  locales,
  mainLocale,
  language,
  onLanguageChange,
  children,
}: {
  locales: string[];
  mainLocale: string;
  language?: string;
  onLanguageChange?: (language: string) => void;
  children: ReactNode;
}) {
  const { locale } = useLocale();
  const [selected, setSelected] = useState(
    locales.find((l) => l === locale || l === locale.split("-")[0]) ??
      mainLocale,
  );
  const active = language ?? selected;
  const safe = locales.includes(active) ? active : mainLocale;
  return (
    <ContentLanguageContext.Provider
      value={{
        locales,
        mainLocale,
        language: safe,
        select: (next) => {
          if (!locales.includes(next)) return;
          setSelected(next);
          onLanguageChange?.(next);
        },
      }}
    >
      {children}
    </ContentLanguageContext.Provider>
  );
}
export function useContentLanguage(): Scope {
  return (
    useContext(ContentLanguageContext) ?? {
      locales: ["en-GB"],
      mainLocale: "en-GB",
      language: "en-GB",
      select: () => {},
    }
  );
}
