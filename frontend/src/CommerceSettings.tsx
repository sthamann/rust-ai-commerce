/** Country/tax/shipping/payment configuration uses the active workspace request and one revision. */
import { useState, useEffect } from "react";
import { useShopText } from "./shop-i18n";
import { useCustomerText } from "./customer-i18n";
import type { Config } from "./shop-api";
import type { RequestFn } from "./studio-types";
export default function CommerceSettings({
  request,
  area,
  canWrite,
}: {
  request: RequestFn;
  area: "taxes" | "countries" | "shipping" | "payment";
  canWrite: boolean;
}) {
  const { s } = useShopText(),
    { c, locale } = useCustomerText();
  const [config, setConfig] = useState<Config>(),
    [original, setOriginal] = useState<Config>(),
    [revision, setRevision] = useState(0),
    [country, setCountry] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    request("/api/merchant/commerce")
      .then((v) => {
        setConfig(v.data);
        setOriginal(v.data);
        setRevision(v.revision);
      })
      .catch((e) => setError(e.message));
  }, [request]);
  const dirty = JSON.stringify(config) !== JSON.stringify(original);
  if (!config) return <p role="status">{error || s("loading")}</p>;
  const patch = (data: Partial<Config>) => {
    setConfig({ ...config, ...data });
    setSaved(false);
  };
  return (
    <section className="studio-card">
      <div className="section-heading">
        <h2>{area === "countries" ? c(area) : s(area)}</h2>
        <span>
          {c("revision")} {revision}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{s("saved")}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await request(
              "/api/merchant/commerce",
              { data: config, revision },
              "PUT",
            );
            setRevision(result.revision);
            setOriginal(structuredClone(config));
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
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
        {canWrite && (
          <button className="studio-primary" disabled={busy || !dirty}>
            {s("save")}
          </button>
        )}
      </form>
    </section>
  );
}
