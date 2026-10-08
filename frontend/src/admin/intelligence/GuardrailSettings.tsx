/** Merchant AI boundaries edit the canonical revisioned commerce settings, never a second policy store. */
import { useState } from "react";
import type { Config } from "../../shared/api/shop-api";
import type { RequestFn, Product } from "../shell/studio-types";
import { useSettingsDraft } from "../settings/useSettingsDraft";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import { useStudio } from "../shell/StudioContext";
type Corridor = {
  productId: string;
  currency: string;
  minimumMinor: number;
  maximumMinor: number;
  minimumMarginBps: number;
  unitCostNetMinor?: number | null;
  maximumDiscountBps?: number | null;
  priceLocked?: boolean;
  requireAvailable?: boolean;
};
type Policy = {
  corridors: Corridor[];
  autonomy: { enabled: boolean; maxChangeBps: number; productsPerDay: number };
};
type Settings = Config & { aiPolicy?: Policy };
export default function GuardrailSettings({
  request,
  products,
}: {
  request: RequestFn;
  products: Product[];
}) {
  const k = useKnowledgeText(),
    { access } = useStudio();
  const state = useSettingsDraft<Settings>(request, "/api/merchant/commerce");
  const [selected, setSelected] = useState(products[0]?.id ?? "");
  const policy = state.value?.data.aiPolicy ?? {
    corridors: [],
    autonomy: { enabled: false, maxChangeBps: 500, productsPerDay: 20 },
  };
  const editable = access.includes("settings.write");
  const update = (next: Policy) => {
    if (state.value) state.change({ ...state.value.data, aiPolicy: next });
  };
  const patch = (index: number, value: Partial<Corridor>) =>
    update({
      ...policy,
      corridors: policy.corridors.map((row, i) =>
        i === index ? { ...row, ...value } : row,
      ),
    });
  const add = () => {
    const product = products.find((p) => p.id === selected);
    const code =
      product?.extra?.priceCurrency ??
      state.value?.data.currencies?.pricingCurrency ??
      state.value?.data.currencies?.baseCurrency;
    const scale = state.value?.data.currencies?.definitions.find(
      (c) => c.code === code,
    )?.scale;
    if (
      !product ||
      !code ||
      scale === undefined ||
      policy.corridors.some((c) => c.productId === selected)
    )
      return;
    const current = Math.round(product.price * 10 ** scale);
    update({
      ...policy,
      corridors: [
        ...policy.corridors,
        {
          productId: selected,
          currency: code,
          minimumMinor: current,
          maximumMinor: current,
          minimumMarginBps: 0,
          requireAvailable: true,
        },
      ],
    });
  };
  return (
    <section className="studio-card evidence-review">
      <h2>{k("guardrails")}</h2>
      <p className="muted">{k("guardrailBoundary")}</p>
      {state.error && (
        <p role="alert" className="knowledge-alert">
          {state.error}
        </p>
      )}
      {state.value && (
        <fieldset disabled={!editable || state.busy}>
          <div className="knowledge-form-grid">
            <label>
              <input
                type="checkbox"
                checked={policy.autonomy.enabled}
                onChange={(e) =>
                  update({
                    ...policy,
                    autonomy: { ...policy.autonomy, enabled: e.target.checked },
                  })
                }
              />
              {k("enableAutonomy")}
            </label>
            <label>
              {k("dailyProducts")}
              <input
                type="number"
                min={1}
                max={100}
                value={policy.autonomy.productsPerDay}
                onChange={(e) =>
                  update({
                    ...policy,
                    autonomy: {
                      ...policy.autonomy,
                      productsPerDay: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              {k("changeBps")}
              <input
                type="number"
                min={0}
                max={500}
                value={policy.autonomy.maxChangeBps}
                onChange={(e) =>
                  update({
                    ...policy,
                    autonomy: {
                      ...policy.autonomy,
                      maxChangeBps: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="knowledge-form-grid">
            <label>
              {k("products")}
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="studio-secondary" onClick={add}>
              {k("addCorridor")}
            </button>
          </div>
          {policy.corridors.map((r, index) => (
            <article key={r.productId} className="claim-review-card">
              <h3>
                {products.find((p) => p.id === r.productId)?.name ??
                  r.productId}{" "}
                · {r.currency}
              </h3>
              <div className="knowledge-form-grid">
                {(
                  [
                    "minimumMinor",
                    "maximumMinor",
                    "minimumMarginBps",
                    "unitCostNetMinor",
                    "maximumDiscountBps",
                  ] as const
                ).map((field) => (
                  <label key={field}>
                    {k(field)}
                    <input
                      type="number"
                      min={0}
                      max={field.endsWith("Bps") ? 10000 : 1000000000000}
                      value={r[field] ?? ""}
                      onChange={(e) =>
                        patch(index, {
                          [field]:
                            e.target.value === "" &&
                            (field === "unitCostNetMinor" ||
                              field === "maximumDiscountBps")
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={r.priceLocked ?? false}
                    onChange={(e) =>
                      patch(index, { priceLocked: e.target.checked })
                    }
                  />
                  {k("priceLocked")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={r.requireAvailable ?? false}
                    onChange={(e) =>
                      patch(index, { requireAvailable: e.target.checked })
                    }
                  />
                  {k("requireAvailable")}
                </label>
              </div>
              <button
                type="button"
                className="studio-secondary"
                onClick={() =>
                  update({
                    ...policy,
                    corridors: policy.corridors.filter((_, i) => i !== index),
                  })
                }
              >
                {k("removeCorridor")}
              </button>
            </article>
          ))}
          <button
            type="button"
            className="studio-primary"
            disabled={!state.dirty || state.busy}
            onClick={() => void state.save()}
          >
            {k("saveGuardrails")}
          </button>
          {state.saved && <p role="status">{k("guardrailsSaved")}</p>}
        </fieldset>
      )}
    </section>
  );
}
