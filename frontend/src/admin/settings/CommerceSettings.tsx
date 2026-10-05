/** Country/tax/shipping/payment configuration uses the active workspace request and one revision. */
import { useEffect, useState } from "react";
import type { Config } from "../../shared/api/shop-api";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import type { RequestFn } from "../shell/studio-types";
import { useSettingsDraft } from "./useSettingsDraft";
import SettingsSaveBar from "./SettingsSaveBar";
export default function CommerceSettings({
  request,
  area,
  canWrite,
  onDirty,
}: {
  request: RequestFn;
  area: "taxes" | "countries" | "shipping" | "payment";
  canWrite: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const { s } = useShopText(),
    { c, locale } = useCustomerText();
  const state = useSettingsDraft<Config>(request, "/api/merchant/commerce");
  const { value, dirty, busy, error } = state;
  const [country, setCountry] = useState("");
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  const config = value?.data;
  const revision = value?.revision;
  if (!config)
    return <p role={error ? "alert" : "status"}>{error || s("loading")}</p>;
  const patch = (data: Partial<Config>) => state.change({ ...config, ...data });
  return (
    <section className="studio-card settings-panel">
      <div className="settings-panel-header">
        <h2>{area === "countries" ? c(area) : s(area)}</h2>
        <span>
          {c("revision")} {revision}
        </span>
      </div>
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canWrite) void state.save();
        }}
      >
        <fieldset disabled={!canWrite || busy} className="settings-fields">
          {area === "taxes" &&
            config.taxes.map((t) => (
              <article key={t.id}>
                <h3>{s(t.id === "standard" ? "standardTax" : "reducedTax")}</h3>
                <div className="customer-field-grid">
                  {config.countries.map((code) => (
                    <label key={code}>
                      {new Intl.DisplayNames([locale], { type: "region" }).of(
                        code,
                      )}{" "}
                      · %
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step="0.01"
                        required
                        value={t.rates[code]}
                        onChange={(e) =>
                          patch({
                            taxes: config.taxes.map((v) =>
                              v.id === t.id
                                ? {
                                    ...v,
                                    rates: {
                                      ...v.rates,
                                      [code]: Number(e.target.value),
                                    },
                                  }
                                : v,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </article>
            ))}
          {area === "countries" && (
            <>
              <div className="settings-country-list">
                {config.countries.map((code) => (
                  <span key={code}>
                    {new Intl.DisplayNames([locale], { type: "region" }).of(
                      code,
                    )}{" "}
                    · {code}
                  </span>
                ))}
              </div>
              <label>
                {c("country")}
                <input
                  maxLength={2}
                  value={country}
                  pattern="[A-Z]{2}"
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                />
              </label>
              <button
                type="button"
                className="studio-secondary"
                disabled={
                  !/^[A-Z]{2}$/.test(country) ||
                  config.countries.includes(country)
                }
                onClick={() => {
                  patch({
                    countries: [...config.countries, country],
                    taxes: config.taxes.map((t) => ({
                      ...t,
                      rates: { ...t.rates, [country]: 0 },
                    })),
                  });
                  setCountry("");
                }}
              >
                {c("add")}
              </button>
            </>
          )}
          {area === "shipping" &&
            config.shipping.map((v, i) => (
              <article className="settings-method" key={v.id}>
                <h3>
                  {s(v.name)} <small>{v.id}</small>
                </h3>
                <div className="customer-field-grid">
                  {(
                    [
                      "name",
                      "price",
                      "freeAbove",
                      "minDays",
                      "maxDays",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {k === "minDays" || k === "maxDays"
                        ? c(k)
                        : s(k === "price" ? "fee" : k)}
                      <input
                        type={k === "name" ? "text" : "number"}
                        min={0}
                        step={k === "price" || k === "freeAbove" ? "0.01" : "1"}
                        value={v[k] ?? ""}
                        onChange={(e) =>
                          patch({
                            shipping: config.shipping.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    [k]:
                                      k === "name"
                                        ? e.target.value
                                        : e.target.value === "" &&
                                            k === "freeAbove"
                                          ? null
                                          : Number(e.target.value),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    {s("taxType")}
                    <select
                      value={v.taxType}
                      onChange={(e) =>
                        patch({
                          shipping: config.shipping.map((x, j) =>
                            j === i ? { ...x, taxType: e.target.value } : x,
                          ),
                        })
                      }
                    >
                      <option value="highest">{s("highest")}</option>
                      <option value="proportional">{s("proportional")}</option>
                    </select>
                  </label>
                </div>
                <div className="customer-defaults">
                  <label>
                    <input
                      type="checkbox"
                      checked={v.active}
                      onChange={(e) =>
                        patch({
                          shipping: config.shipping.map((x, j) =>
                            j === i ? { ...x, active: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    {s("active")}
                  </label>
                  {config.countries.map((code) => (
                    <label key={code}>
                      <input
                        type="checkbox"
                        checked={v.countries.includes(code)}
                        onChange={(e) =>
                          patch({
                            shipping: config.shipping.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    countries: e.target.checked
                                      ? [...x.countries, code]
                                      : x.countries.filter((c) => c !== code),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                      {code}
                    </label>
                  ))}
                </div>
              </article>
            ))}
          {area === "payment" &&
            config.payments.map((v, i) => (
              <article className="settings-method" key={v.id}>
                <h3>
                  {s(v.name)}{" "}
                  <small>
                    {v.mode} · {v.id}
                  </small>
                </h3>
                <div className="customer-defaults">
                  <label>
                    <input
                      type="checkbox"
                      checked={v.active}
                      onChange={(e) =>
                        patch({
                          payments: config.payments.map((x, j) =>
                            j === i ? { ...x, active: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    {s("active")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={v.businessOnly}
                      onChange={(e) =>
                        patch({
                          payments: config.payments.map((x, j) =>
                            j === i
                              ? { ...x, businessOnly: e.target.checked }
                              : x,
                          ),
                        })
                      }
                    />
                    {c("businessOnly")}
                  </label>
                </div>
              </article>
            ))}
        </fieldset>
        <SettingsSaveBar {...state} canWrite={canWrite} />
      </form>
    </section>
  );
}
