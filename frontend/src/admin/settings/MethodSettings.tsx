/** Master/detail shipping and payment configuration, translated content and searchable country availability. */
import { useState } from "react";
import type { Payment, Shipping } from "../../shared/api/shop-api";
import CountryPicker from "../../shared/geography/CountryPicker";
import TranslationFields from "../../shared/geography/TranslationFields";
import { inheritedText } from "../../shared/geography/geography-types";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { InternationalProps } from "./CommerceSettings";
export default function MethodSettings({
  config,
  patch,
  countries,
  area,
}: InternationalProps & { area: "shipping" | "payment" }) {
  const { i, locale } = useInternationalText();
  const [selected, setSelected] = useState("");
  const methods = area === "shipping" ? config.shipping : config.payments;
  const method = methods.find((m) => m.id === selected) ?? methods[0];
  const label = (m: Shipping | Payment) =>
    inheritedText(m.translations ?? {}, locale, config.mainLocale, "name") ||
    m.name;
  const update = (v: Partial<Shipping & Payment>) => {
    if (area === "shipping")
      patch({
        shipping: config.shipping.map((m) =>
          m.id === method.id ? { ...m, ...v } : m,
        ),
      });
    else
      patch({
        payments: config.payments.map((m) =>
          m.id === method.id ? { ...m, ...v } : m,
        ),
      });
  };
  const add = () => {
    const id = `${area}-${crypto.randomUUID().slice(0, 8)}`,
      name = i(area === "shipping" ? "newShipping" : "newPayment");
    const base = {
      id,
      name,
      translations: { [config.mainLocale]: { name, description: "" } },
      active: true,
      countries: [...config.countries],
    };
    if (area === "shipping")
      patch({
        shipping: [
          ...config.shipping,
          {
            ...base,
            price: 0,
            freeAbove: null,
            minDays: 1,
            maxDays: 3,
            taxType: "highest",
          },
        ],
      });
    else
      patch({
        payments: [
          ...config.payments,
          {
            ...base,
            restrictedCountries: true,
            businessOnly: false,
            mode: "manual",
          },
        ],
      });
    setSelected(id);
  };
  return (
    <div className="intl-master-detail">
      <aside className="intl-record-list">
        {methods.map((m) => (
          <button
            type="button"
            key={m.id}
            aria-pressed={method?.id === m.id}
            onClick={() => setSelected(m.id)}
          >
            <span>
              <strong>{label(m)}</strong>
              <small>{m.id}</small>
            </span>
            <span className={m.active ? "intl-dot" : "intl-dot inactive"} />
          </button>
        ))}
        <button type="button" className="studio-secondary" onClick={add}>
          + {i(area === "shipping" ? "newShipping" : "newPayment")}
        </button>
      </aside>
      {method && (
        <div className="intl-record" key={`${area}:${method.id}`}>
          <div className="intl-section-heading">
            <h3>{label(method)}</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={method.active}
                onChange={(e) => update({ active: e.target.checked })}
              />
              {i("active")}
            </label>
          </div>
          <TranslationFields
            value={
              method.translations ?? {
                [config.mainLocale]: { name: method.name },
              }
            }
            locales={config.locales}
            mainLocale={config.mainLocale}
            onChange={(translations) =>
              update({
                translations,
                name:
                  inheritedText(
                    translations,
                    config.mainLocale,
                    config.mainLocale,
                    "name",
                  ) || method.name,
              })
            }
          />
          <div className="intl-rule-grid">
            {area === "shipping" ? (
              <>
                {(["price", "freeAbove", "minDays", "maxDays"] as const).map(
                  (k, n) => (
                    <label key={k}>
                      {i(
                        (["fee", "freeAbove", "minDays", "maxDays"] as const)[
                          n
                        ],
                      )}
                      <input
                        type="number"
                        min={0}
                        step={n < 2 ? "0.01" : "1"}
                        value={(method as Shipping)[k] ?? ""}
                        onChange={(e) =>
                          update({
                            [k]:
                              e.target.value === "" && k === "freeAbove"
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ),
                )}
                <label>
                  {i("taxType")}
                  <select
                    value={(method as Shipping).taxType}
                    onChange={(e) => update({ taxType: e.target.value })}
                  >
                    <option value="highest">{i("highest")}</option>
                    <option value="proportional">{i("proportional")}</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  {i("mode")}
                  <select
                    value={(method as Payment).mode}
                    disabled={(method as Payment).mode === "app"}
                    onChange={(e) => update({ mode: e.target.value })}
                  >
                    <option value="manual">{i("manual")}</option>
                    <option value="simulated">{i("simulated")}</option>
                    {(method as Payment).mode === "app" && (
                      <option value="app">{i("app")}</option>
                    )}
                  </select>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(method as Payment).businessOnly}
                    onChange={(e) => update({ businessOnly: e.target.checked })}
                  />
                  {i("businessOnly")}
                </label>
              </>
            )}
          </div>
          {area === "payment" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={
                  !(method as Payment).restrictedCountries &&
                  !method.countries?.length
                }
                onChange={(e) =>
                  update({
                    countries: e.target.checked ? [] : [...config.countries],
                    restrictedCountries: !e.target.checked,
                  })
                }
              />
              {i("allCountries")}
            </label>
          )}
          {(area === "shipping" ||
            !!(method as Payment).restrictedCountries ||
            !!method.countries?.length) && (
            <CountryPicker
              countries={countries.filter((c) =>
                config.countries.includes(c.code),
              )}
              mainLocale={config.mainLocale}
              label={i("countryRestriction")}
              value={method.countries ?? []}
              onChange={(countries) =>
                update({
                  countries,
                  ...(area === "payment" ? { restrictedCountries: true } : {}),
                })
              }
            />
          )}
          <button
            type="button"
            className="studio-secondary"
            disabled={methods.length === 1}
            onClick={() => {
              if (area === "shipping")
                patch({
                  shipping: config.shipping.filter((m) => m.id !== method.id),
                });
              else
                patch({
                  payments: config.payments.filter((m) => m.id !== method.id),
                });
              setSelected("");
            }}
          >
            {i("remove")}
          </button>
        </div>
      )}
    </div>
  );
}
