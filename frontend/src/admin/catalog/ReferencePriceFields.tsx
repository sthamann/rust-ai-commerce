/** Native reference-unit inputs feed the same server-calculated unit price displayed on product pages. */
import type { ProductDraft } from "./catalog-model";
import { useCatalogText } from "../../shared/i18n/catalog-i18n";
export default function ReferencePriceFields({
  draft: d,
  onChange,
}: {
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
}) {
  const { c } = useCatalogText();
  const value = d.commerce.referencePrice;
  return (
    <>
      <h2>{c("referencePrice")}</h2>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) =>
            onChange({
              ...d,
              commerce: {
                ...d.commerce,
                referencePrice: e.target.checked
                  ? { purchase_unit: 1, reference_unit: 1, unit_name: "kg" }
                  : null,
              },
            })
          }
        />
        {c("referencePrice")}
      </label>
      {value && (
        <div className="catalog-form-grid">
          {(["purchase_unit", "reference_unit", "unit_name"] as const).map(
            (k, i) => (
              <label key={k}>
                {c((["purchaseUnit", "referenceUnit", "unit"] as const)[i])}
                <input
                  type={i === 2 ? "text" : "number"}
                  min={0.001}
                  step="0.001"
                  value={value[k]}
                  onChange={(e) =>
                    onChange({
                      ...d,
                      commerce: {
                        ...d.commerce,
                        referencePrice: {
                          ...value,
                          [k]:
                            i === 2 ? e.target.value : Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            ),
          )}
        </div>
      )}
    </>
  );
}
