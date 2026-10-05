/** Field-wise translation editor: missing values inherit the shop main language; explicit blanks remain explicit. */
import { useId, useState } from "react";
import { useInternationalText } from "../i18n/international-i18n";
import { inheritedText, type TextMap } from "./geography-types";
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
  const { i, locale } = useInternationalText();
  const prefix = useId();
  const [selected, setSelected] = useState(
    locales.includes(locale) ? locale : mainLocale,
  );
  const lang =
      language && locales.includes(language)
        ? language
        : locales.includes(selected)
          ? selected
          : mainLocale,
    base = lang.split("-")[0];
  const key =
    value[lang] !== undefined
      ? lang
      : value[base] !== undefined &&
          locales.filter((l) => l.split("-")[0] === base).length === 1
        ? base
        : lang;
  const item = value[key] ?? {};
  const main = lang === mainLocale;
  const fields = nameOnly
    ? (["name"] as const)
    : (["name", "description"] as const);
  const set = (field: "name" | "description", v: string | null) =>
    onChange({ ...value, [key]: { ...item, [field]: v } });
  const label = (l: string) =>
    new Intl.DisplayNames([locale], { type: "language" }).of(l) ?? l;
  return (
    <div className="intl-translations">
      <div
        className="intl-language-tabs"
        role="tablist"
        aria-label={i("languages")}
      >
        {locales.map((l) => (
          <button
            type="button"
            key={l}
            role="tab"
            aria-selected={l === lang}
            onClick={() => {
              setSelected(l);
              onLanguageChange?.(l);
            }}
          >
            {label(l)}
            {l === mainLocale && <small> · {i("mainLanguage")}</small>}
          </button>
        ))}
      </div>
      {fields.map((field) => {
        const inherited = item[field] == null && !main;
        const fallback = inheritedText(value, mainLocale, mainLocale, field);
        return (
          <div className="intl-translated-field" key={field}>
            <div className="intl-field-heading">
              <label htmlFor={`${prefix}-${key}-${field}`}>{i(field)}</label>
              {!main && (
                <button
                  type="button"
                  className="intl-inherit"
                  aria-pressed={inherited}
                  onClick={() => set(field, inherited ? fallback : null)}
                >
                  {i(inherited ? "inheritedFrom" : "customText")}
                  {inherited ? ` ${label(mainLocale)}` : ""} ↗
                </button>
              )}
            </div>
            {field === "description" ? (
              <textarea
                id={`${prefix}-${key}-${field}`}
                rows={3}
                maxLength={4000}
                value={item[field] ?? ""}
                placeholder={inherited ? fallback : undefined}
                onChange={(e) => set(field, e.target.value)}
              />
            ) : (
              <input
                id={`${prefix}-${key}-${field}`}
                maxLength={200}
                value={item[field] ?? ""}
                placeholder={inherited ? fallback : undefined}
                onChange={(e) => set(field, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
