/** Single visible field for the editor's language, with main-language preview and explicit restore-to-inheritance. */
import { useId } from "react";
import { useContentLanguage } from "./ContentLanguage";
import { useInternationalText } from "./international-i18n";
import {
  contentKey,
  contentText,
  type LocalizedText,
} from "./content-language";
export default function LocalizedField({
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
  required = false,
}: {
  label: string;
  value: LocalizedText;
  onChange: (map: LocalizedText) => void;
  multiline?: boolean;
  maxLength?: number;
  required?: boolean;
}) {
  const id = useId(),
    { language, locales, mainLocale } = useContentLanguage(),
    { i, locale } = useInternationalText();
  const key = contentKey(value, language, locales),
    main = language === mainLocale;
  const inherited = !main && value[key] == null;
  const fallback = contentText(value, mainLocale, mainLocale);
  const set = (text: string) => onChange({ ...value, [key]: text });
  const props = {
    id,
    value: value[key] ?? "",
    placeholder: inherited ? fallback : undefined,
    maxLength,
    required: required && main,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(e.target.value),
  };
  return (
    <div className="intl-translated-field">
      <div className="intl-field-heading">
        <label htmlFor={id}>{label}</label>
        {!main && (
          <button
            type="button"
            className="intl-inherit"
            aria-pressed={inherited}
            onClick={() => {
              if (inherited) set(fallback);
              else {
                const next = { ...value };
                delete next[key];
                onChange(next);
              }
            }}
          >
            {i(inherited ? "inheritedFrom" : "customText")}
            {inherited
              ? ` ${new Intl.DisplayNames([locale], { type: "language" }).of(mainLocale) ?? mainLocale}`
              : ""}{" "}
            ↗
          </button>
        )}
      </div>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
    </div>
  );
}
