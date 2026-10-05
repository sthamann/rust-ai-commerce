/** Shared single-language fields for configurable object content; per-field null restores main-language inheritance. */
import {
  ContentLanguage,
  useOptionalContentLanguage,
} from "../i18n/ContentLanguage";
import ContentLanguagePicker from "../i18n/ContentLanguagePicker";
import LocalizedField from "../i18n/LocalizedField";
import { useInternationalText } from "../i18n/international-i18n";
import type { TextMap } from "./geography-types";
export default function TranslationFields({
  value,
  onChange,
  locales,
  mainLocale,
  nameOnly = false,
  language,
  onLanguageChange,
}: {
  value: TextMap;
  onChange: (value: TextMap) => void;
  locales: string[];
  mainLocale: string;
  nameOnly?: boolean;
  language?: string;
  onLanguageChange?: (locale: string) => void;
}) {
  const { i } = useInternationalText();
  const parent = useOptionalContentLanguage();
  const fields = (
    <div className="intl-translations">
      {!parent && <ContentLanguagePicker />}
      {(nameOnly
        ? (["name"] as const)
        : (["name", "description"] as const)
      ).map((field) => (
        <LocalizedField
          key={field}
          label={i(field)}
          required={field === "name"}
          multiline={field === "description"}
          maxLength={field === "name" ? 200 : 4000}
          value={Object.fromEntries(
            Object.entries(value).map(([key, record]) => [key, record[field]]),
          )}
          onChange={(next) =>
            onChange(
              Object.fromEntries(
                [...new Set([...Object.keys(value), ...Object.keys(next)])].map(
                  (key) => [key, { ...value[key], [field]: next[key] ?? null }],
                ),
              ),
            )
          }
        />
      ))}
    </div>
  );
  if (parent) return fields;
  return (
    <ContentLanguage
      locales={locales}
      mainLocale={mainLocale}
      language={language}
      onLanguageChange={onLanguageChange}
    >
      {fields}
    </ContentLanguage>
  );
}
