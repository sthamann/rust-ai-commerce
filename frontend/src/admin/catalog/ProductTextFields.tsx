/** Product name/description editing with explicit field inheritance; never copy fallback values into every language. */
import { useId } from "react";
import { useCatalogText } from "./catalog-i18n";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { ProductDraft } from "./catalog-model";
export default function ProductTextFields({
  draft: d,
  lang,
  onChange,
}: {
  draft: ProductDraft;
  lang: string;
  onChange: (d: ProductDraft) => void;
}) {
  const prefix = useId();
  const { c } = useCatalogText();
  const { i } = useInternationalText();
  const mainLocale = d.mainLocale ?? "en-GB",
    mainKey = d.translations[mainLocale]
      ? mainLocale
      : mainLocale.split("-")[0];
  const main = lang === mainKey;
  const tr = d.translations[lang] ?? { name: null, description: null };
  const set = (field: "name" | "description", v: string | null) =>
    onChange({
      ...d,
      translations: { ...d.translations, [lang]: { ...tr, [field]: v } },
    });
  return (
    <div className="catalog-form-grid">
      {(["name", "description"] as const).map((field) => (
        <div
          className={`catalog-translated-field ${field === "description" ? "catalog-span" : ""}`}
          key={field}
        >
          <label htmlFor={`${prefix}-${field}`}>
            {c(field)} · {lang.toUpperCase()}
          </label>
          {!main && (
            <button
              type="button"
              className="intl-inherit"
              aria-pressed={tr[field] == null}
              onClick={() =>
                set(
                  field,
                  tr[field] == null
                    ? (d.translations[mainKey]?.[field] ?? "")
                    : null,
                )
              }
            >
              {i(tr[field] == null ? "inheritedFrom" : "customText")}{" "}
              {tr[field] == null ? mainLocale : ""} ↗
            </button>
          )}
          {field === "name" ? (
            <input
              id={`${prefix}-${field}`}
              required={main}
              maxLength={200}
              placeholder={
                tr[field] == null
                  ? (d.translations[mainKey]?.[field] ?? "")
                  : undefined
              }
              value={tr[field] ?? ""}
              onChange={(e) => set(field, e.target.value)}
            />
          ) : (
            <textarea
              id={`${prefix}-${field}`}
              rows={3}
              maxLength={4000}
              placeholder={
                tr[field] == null
                  ? (d.translations[mainKey]?.[field] ?? "")
                  : undefined
              }
              value={tr[field] ?? ""}
              onChange={(e) => set(field, e.target.value)}
            />
          )}
        </div>
      ))}
      <label>
        {c("number")}
        <input
          required
          maxLength={100}
          value={d.catalog.productNumber}
          onChange={(e) =>
            onChange({
              ...d,
              catalog: { ...d.catalog, productNumber: e.target.value },
            })
          }
        />
      </label>
    </div>
  );
}
