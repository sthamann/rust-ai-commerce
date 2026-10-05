/** Product text uses the shared single-language editor and field inheritance; product number stays language independent. */
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { useCatalogText } from "./catalog-i18n";
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
  const { c } = useCatalogText();
  const mainLocale = d.mainLocale ?? "en-GB",
    mainKey = d.translations[mainLocale]
      ? mainLocale
      : mainLocale.split("-")[0];
  return (
    <ContentLanguage
      locales={[...new Set([...Object.keys(d.translations), lang, mainKey])]}
      mainLocale={mainKey}
      language={lang}
    >
      <div className="catalog-form-grid">
        {(["name", "description"] as const).map((field) => (
          <div
            key={field}
            className={field === "description" ? "catalog-span" : ""}
          >
            <LocalizedField
              label={c(field)}
              multiline={field === "description"}
              required={field === "name"}
              maxLength={field === "name" ? 200 : 4000}
              value={Object.fromEntries(
                Object.entries(d.translations).map(([key, record]) => [
                  key,
                  record[field],
                ]),
              )}
              onChange={(next) =>
                onChange({
                  ...d,
                  translations: Object.fromEntries(
                    [
                      ...new Set([
                        ...Object.keys(d.translations),
                        ...Object.keys(next),
                      ]),
                    ].map((key) => [
                      key,
                      {
                        ...(d.translations[key] ?? {
                          name: null,
                          description: null,
                        }),
                        [field]: next[key] ?? null,
                      },
                    ]),
                  ),
                })
              }
            />
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
    </ContentLanguage>
  );
}
