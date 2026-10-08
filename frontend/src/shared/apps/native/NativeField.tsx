/** One typed field editor for native forms; rich text uses the product editor and configured language inheritance. */
import NativeAssetField from "./NativeAssetField";
import NativeRelationField from "./NativeRelationField";
import LocalizedField from "../../i18n/LocalizedField";
import { useContentLanguage } from "../../i18n/ContentLanguage";
import { contentText, type LocalizedText } from "../../i18n/content-language";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import RichEditor from "../../content/editor/RichEditor";
import type { RichBlock } from "../../content/RichDescription";
import type { Field } from "./types";
function localDateTime(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function NativeField({
  field: f,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { a, locale } = useAppStudioText();
  const { language, mainLocale } = useContentLanguage();
  const label = contentText(f.label, locale, mainLocale) || f.name;
  if (["image", "file"].includes(f.kind))
    return <NativeAssetField field={f} value={value} onChange={onChange} />;
  if (f.references)
    return <NativeRelationField field={f} value={value} onChange={onChange} />;
  if (f.translatable)
    return (
      <LocalizedField
        label={label}
        value={(value as LocalizedText) ?? {}}
        onChange={onChange}
        maxLength={2000}
        required={f.required}
        multiline
      />
    );
  if (f.kind === "richtext")
    return (
      <div className="native-rich-field">
        <span>{label}</span>
        <RichEditor
          value={(() => {
            const map = (value as Record<string, RichBlock[]>) ?? {};
            const own = map[language] ?? map[language.split("-")[0]];
            const inherited = map[mainLocale] ?? map[mainLocale.split("-")[0]];
            return { ...map, [language]: own ?? inherited ?? [] };
          })()}
          onChange={onChange}
          language={language}
        />
      </div>
    );
  if (f.kind === "money") {
    const money = (value ?? {
      minor: 0,
      currency: { code: "EUR", scale: 2 },
    }) as { minor: number; currency: { code: string; scale: number } };
    return (
      <fieldset className="native-money">
        <legend>{label}</legend>
        <label>
          {a("minorUnits")}
          <input
            type="number"
            step="1"
            value={money.minor}
            onChange={(e) =>
              onChange({ ...money, minor: Number(e.target.value) })
            }
          />
        </label>
        <label>
          {a("currencyCode")}
          <input
            maxLength={3}
            pattern="[A-Z]{3}"
            value={money.currency.code}
            onChange={(e) =>
              onChange({
                ...money,
                currency: {
                  ...money.currency,
                  code: e.target.value.toUpperCase(),
                },
              })
            }
          />
        </label>
        <label>
          {a("currencyScale")}
          <input
            type="number"
            min="0"
            max="3"
            value={money.currency.scale}
            onChange={(e) =>
              onChange({
                ...money,
                currency: { ...money.currency, scale: Number(e.target.value) },
              })
            }
          />
        </label>
      </fieldset>
    );
  }
  return (
    <label>
      {label}
      {f.choices?.length ? (
        <select
          value={String(value ?? "")}
          required={f.required}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {f.choices.map((c) => (
            <option value={c.value} key={c.value}>
              {contentText(c.label, locale, mainLocale) || c.value}
            </option>
          ))}
        </select>
      ) : f.kind === "boolean" ? (
        <select
          value={value == null ? "" : String(value)}
          required={f.required}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value === "true")
          }
        >
          <option value="">—</option>
          <option value="true">{a("yes")}</option>
          <option value="false">{a("no")}</option>
        </select>
      ) : f.kind === "json" ? (
        <textarea
          value={
            typeof value === "string"
              ? value
              : JSON.stringify(value ?? {}, null, 2)
          }
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={
            f.kind === "integer"
              ? "number"
              : f.kind === "date"
                ? "date"
                : f.kind === "datetime"
                  ? "datetime-local"
                  : "text"
          }
          step={f.kind === "integer" ? 1 : undefined}
          maxLength={2000}
          required={f.required}
          value={
            f.kind === "datetime" ? localDateTime(value) : String(value ?? "")
          }
          onChange={(e) =>
            onChange(
              f.kind === "integer"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : f.kind === "datetime" && e.target.value
                  ? new Date(e.target.value).toISOString()
                  : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
