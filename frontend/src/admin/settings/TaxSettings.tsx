/** Editable tax classes and explicit fallback/country rates with destination rules using native Rule Builder references. */
import { useState } from "react";
import TranslationFields from "../../shared/geography/TranslationFields";
import {
  inheritedText,
  type DestinationRule,
  type TaxClass,
} from "../../shared/geography/geography-types";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { InternationalProps } from "./CommerceSettings";
import DestinationRuleEditor from "./DestinationRuleEditor";
export default function TaxSettings({
  config,
  patch,
  countries,
  request,
}: InternationalProps) {
  const { i, locale } = useInternationalText();
  const [selected, setSelected] = useState(config.taxes[0]?.id),
    [rule, setRule] = useState<string | null>(null);
  const tax = config.taxes.find((t) => t.id === selected) ?? config.taxes[0];
  const label = (t: TaxClass) =>
    inheritedText(t.translations ?? {}, locale, config.mainLocale, "name") ||
    t.id;
  const update = (v: Partial<TaxClass>) =>
    patch({
      taxes: config.taxes.map((t) => (t.id === tax.id ? { ...t, ...v } : t)),
    });
  const addRule = () => {
    const r: DestinationRule = {
      id: `tax-${crypto.randomUUID().slice(0, 8)}`,
      country: config.countries[0],
      rate: tax.rates[config.countries[0]] ?? tax.defaultRate ?? 0,
      priority: 0,
      states: [],
      postalCodes: [],
      postalPrefixes: [],
      postalFrom: null,
      postalTo: null,
      activeFrom: null,
      activeUntil: null,
      condition: null,
    };
    update({ rules: [...(tax.rules ?? []), r] });
    setRule(r.id);
  };
  return (
    <div className="intl-master-detail">
      <aside className="intl-record-list">
        {config.taxes.map((t) => (
          <button
            type="button"
            key={t.id}
            aria-pressed={tax?.id === t.id}
            onClick={() => {
              setSelected(t.id);
              setRule(null);
            }}
          >
            <span>
              <strong>{label(t)}</strong>
              <small>
                {t.id} · {t.rules?.length ?? 0} {i("destinationRules")}
              </small>
            </span>
          </button>
        ))}
        <button
          type="button"
          className="studio-secondary"
          onClick={() => {
            const id = `class-${crypto.randomUUID().slice(0, 8)}`;
            patch({
              taxes: [
                ...config.taxes,
                {
                  id,
                  rates: {},
                  defaultRate: null,
                  translations: { [config.mainLocale]: { name: i("newTax") } },
                  rules: [],
                },
              ],
            });
            setSelected(id);
            setRule(null);
          }}
        >
          + {i("newTax")}
        </button>
      </aside>
      {tax && (
        <div className="intl-record" key={tax.id}>
          <div className="intl-section-heading">
            <h3>{label(tax)}</h3>
            <span className="soft-tag">{tax.id}</span>
          </div>
          <TranslationFields
            nameOnly
            locales={config.locales}
            mainLocale={config.mainLocale}
            value={tax.translations ?? {}}
            onChange={(translations) => update({ translations })}
          />
          <label>
            {i("defaultRate")}
            <input
              type="number"
              min={0}
              max={100}
              step="0.001"
              placeholder={i("noDefault")}
              value={tax.defaultRate ?? ""}
              onChange={(e) =>
                update({
                  defaultRate:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <h3>{i("countryRates")}</h3>
          <div className="intl-rates">
            {config.countries.map((code) => (
              <label key={code}>
                <span>
                  <strong>
                    {countries.find((c) => c.code === code)?.name[
                      locale.split("-")[0]
                    ] ?? code}
                  </strong>
                  <small>{code}</small>
                </span>
                <input
                  aria-label={`${code} ${i("rate")}`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  placeholder={
                    tax.defaultRate == null ? "—" : `${tax.defaultRate}`
                  }
                  value={tax.rates[code] ?? ""}
                  onChange={(e) => {
                    const rates = { ...tax.rates };
                    if (e.target.value === "") delete rates[code];
                    else rates[code] = Number(e.target.value);
                    update({ rates });
                  }}
                />
                <span>%</span>
              </label>
            ))}
          </div>
          <div className="intl-section-heading">
            <h3>{i("destinationRules")}</h3>
            <button
              type="button"
              className="studio-secondary"
              onClick={addRule}
            >
              + {i("newRule")}
            </button>
          </div>
          <p className="intl-hint">{i("ruleHint")}</p>
          <div className="intl-rule-list">
            {(tax.rules ?? []).map((r) => (
              <button
                type="button"
                key={r.id}
                aria-pressed={r.id === rule}
                onClick={() => setRule(rule === r.id ? null : r.id)}
              >
                <span>
                  <strong>
                    {r.country} {r.states.join(" · ")}
                  </strong>
                  <small>
                    {r.id} · {i("priority")} {r.priority}
                  </small>
                </span>
                <strong>{r.rate}%</strong>
              </button>
            ))}
          </div>
          {(tax.rules ?? [])
            .filter((r) => r.id === rule)
            .map((r) => (
              <DestinationRuleEditor
                key={r.id}
                value={r}
                countries={countries}
                request={request}
                config={config}
                onChange={(value) =>
                  update({
                    rules: tax.rules!.map((v) => (v.id === r.id ? value : v)),
                  })
                }
                onRemove={() => {
                  update({ rules: tax.rules!.filter((v) => v.id !== r.id) });
                  setRule(null);
                }}
              />
            ))}
          {!["standard", "reduced"].includes(tax.id) && (
            <button
              type="button"
              className="studio-secondary"
              onClick={() => {
                patch({ taxes: config.taxes.filter((t) => t.id !== tax.id) });
                setSelected(config.taxes[0].id);
              }}
            >
              {i("remove")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
