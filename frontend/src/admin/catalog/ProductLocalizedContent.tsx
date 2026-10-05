/** Consistent main-language inheritance for product rich documents, specification groups and individual SEO fields. */
import { useId } from "react";
import RichEditor from "./RichEditor";
import PairFields from "./PairFields";
import { useCatalogText } from "./catalog-i18n";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { ProductDraft } from "./catalog-model";
import "../styles/international.css";
type Props = {
  draft: ProductDraft;
  lang: string;
  onChange: (d: ProductDraft) => void;
};
function source(d: ProductDraft) {
  const main = d.mainLocale ?? "en-GB";
  return d.translations[main] ? main : main.split("-")[0];
}
export function ProductRich({ draft: d, lang, onChange }: Props) {
  const { i } = useInternationalText();
  const main = source(d),
    map = d.extra.richDescription ?? {},
    inherited = lang !== main && map[lang] == null;
  const set = (value: any) =>
    onChange({ ...d, extra: { ...d.extra, richDescription: value } });
  return (
    <div>
      {lang !== main && (
        <button
          type="button"
          className="intl-inherit"
          aria-pressed={inherited}
          onClick={() => {
            const next = { ...map };
            if (inherited) next[lang] = structuredClone(map[main] ?? []);
            else delete next[lang];
            set(next);
          }}
        >
          {i(inherited ? "inheritedFrom" : "customText")}{" "}
          {inherited ? d.mainLocale : ""} ↗
        </button>
      )}
      <RichEditor
        key={`${lang}:${inherited}`}
        language={lang}
        fallback={
          d.translations[lang]?.description ??
          d.translations[main]?.description ??
          ""
        }
        value={inherited ? { ...map, [lang]: map[main] ?? [] } : map}
        onChange={set}
      />
    </div>
  );
}
export function ProductSpecifications({ draft: d, lang, onChange }: Props) {
  const { i } = useInternationalText();
  const main = source(d),
    map = d.extra.specifications ?? {},
    inherited = lang !== main && map[lang] == null;
  const set = (v: any) =>
    onChange({ ...d, extra: { ...d.extra, specifications: v } });
  return (
    <div>
      {lang !== main && (
        <button
          type="button"
          className="intl-inherit"
          aria-pressed={inherited}
          onClick={() => {
            const next = { ...map };
            if (inherited) next[lang] = structuredClone(map[main] ?? {});
            else delete next[lang];
            set(next);
          }}
        >
          {i(inherited ? "inheritedFrom" : "customText")}{" "}
          {inherited ? d.mainLocale : ""} ↗
        </button>
      )}
      <PairFields
        value={map[lang] ?? map[main] ?? {}}
        onChange={(value) => set({ ...map, [lang]: value })}
      />
    </div>
  );
}
export function ProductSeo({ draft: d, lang, onChange }: Props) {
  const prefix = useId();
  const { c } = useCatalogText(),
    { i } = useInternationalText();
  const main = source(d),
    seo = d.extra.seo?.[lang] ?? {},
    fallback = d.extra.seo?.[main] ?? {};
  const set = (field: string, value: string | null) =>
    onChange({
      ...d,
      extra: {
        ...d.extra,
        seo: { ...d.extra.seo, [lang]: { ...seo, [field]: value } },
      },
    });
  return (
    <div className="catalog-form-grid">
      {(["title", "description", "slug"] as const).map((field) => (
        <div key={field} className="catalog-translated-field">
          <label htmlFor={`${prefix}-${field}`}>
            {c(field === "description" ? "metaDescription" : field)}
          </label>
          {lang !== main && (
            <button
              type="button"
              className="intl-inherit"
              aria-pressed={seo[field] == null}
              onClick={() =>
                set(field, seo[field] == null ? (fallback[field] ?? "") : null)
              }
            >
              {i(seo[field] == null ? "inheritedFrom" : "customText")}{" "}
              {seo[field] == null ? d.mainLocale : ""} ↗
            </button>
          )}
          <input
            id={`${prefix}-${field}`}
            maxLength={field === "description" ? 500 : 200}
            value={seo[field] ?? ""}
            placeholder={
              seo[field] == null ? (fallback[field] ?? "") : undefined
            }
            onChange={(e) => set(field, e.target.value)}
          />
        </div>
      ))}
      <div className="catalog-seo-preview">
        <strong>
          {seo.title ??
            fallback.title ??
            d.translations[lang]?.name ??
            d.translations[main]?.name}
        </strong>
        <small>/{seo.slug ?? fallback.slug ?? d.id}</small>
        <p>
          {seo.description ??
            fallback.description ??
            d.translations[lang]?.description ??
            d.translations[main]?.description}
        </p>
      </div>
    </div>
  );
}
