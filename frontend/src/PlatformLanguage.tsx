/** Locale selector shared by operator sign-in and the workspace. */
import { useLocale, locales, type Locale } from "./i18n";
import { usePlatformText } from "./platform-i18n";
export default function PlatformLanguage() {
  const { locale, setLocale } = useLocale(),
    t = usePlatformText();
  return (
    <select
      aria-label={t("language")}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      {Object.entries(locales).map(([code, label]) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  );
}
