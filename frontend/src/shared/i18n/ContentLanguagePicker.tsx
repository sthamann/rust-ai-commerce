/** Compact shared language switcher with explicit main-language context; selection never changes persisted content. */
import { useContentLanguage } from "./ContentLanguage";
import { useInternationalText } from "./international-i18n";
export default function ContentLanguagePicker() {
  const { locales, mainLocale, language, select } = useContentLanguage();
  const { i, locale } = useInternationalText();
  const label = (l: string) =>
    new Intl.DisplayNames([locale], { type: "language" }).of(l) ?? l;
  return (
    <div className="intl-language-switcher">
      <label>
        {i("contentLanguage")}
        <select value={language} onChange={(e) => select(e.target.value)}>
          {locales.map((l) => (
            <option key={l} value={l}>
              {label(l)}
              {l === mainLocale ? ` · ${i("mainLanguage")}` : ""}
            </option>
          ))}
        </select>
      </label>
      <small>
        {i("mainLanguage")}: {label(mainLocale)}
      </small>
    </div>
  );
}
