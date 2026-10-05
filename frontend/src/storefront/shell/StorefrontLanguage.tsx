/** Shop-configured content languages, including custom locales; the interface keeps its supported language vocabulary. */
import { getContentLocale } from "../../shared/api/shop-api";
import { useCountryCatalogue } from "../../shared/geography/useCountryCatalogue";
import { locales, type Locale } from "../../shared/i18n/i18n";
import { useStorefront } from "./StorefrontContext";
export default function StorefrontLanguage() {
  const catalogue = useCountryCatalogue();
  const { t, locale, setLocale } = useStorefront();
  const choices = catalogue?.locales ?? Object.keys(locales);
  return (
    <select
      aria-label={t("language")}
      value={
        choices.includes(getContentLocale())
          ? getContentLocale()
          : (catalogue?.mainLocale ?? locale)
      }
      onChange={(e) => {
        const next = e.target.value;
        if (next in locales) setLocale(next as Locale);
        const url = new URL(location.href);
        url.searchParams.set("language", next);
        location.assign(url.toString());
      }}
    >
      {choices.map((key) => (
        <option key={key} value={key}>
          {new Intl.DisplayNames([locale], { type: "language" }).of(key) ?? key}
        </option>
      ))}
    </select>
  );
}
