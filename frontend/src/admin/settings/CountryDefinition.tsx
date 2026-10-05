/** Country metadata and subdivision editing with multilingual names; custom definitions cannot invent ISO assignment. */
import { useState } from "react";
import TranslationFields from "../../shared/geography/TranslationFields";
import type { Country, TextMap } from "../../shared/geography/geography-types";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { InternationalConfig } from "./CommerceSettings";
const toText = (names: Record<string, string>): TextMap =>
  Object.fromEntries(Object.entries(names).map(([l, name]) => [l, { name }]));
const toNames = (text: TextMap): Record<string, string> =>
  Object.fromEntries(
    Object.entries(text)
      .filter(([, v]) => v.name != null && v.name !== "")
      .map(([l, v]) => [l, v.name!]),
  );
export default function CountryDefinition({
  value: v,
  config,
  onChange,
  onSave,
  onClose,
}: {
  value: Country;
  config: InternationalConfig;
  onChange: (c: Country) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { i, locale } = useInternationalText();
  const [region, setRegion] = useState<number | null>(null);
  const set = (p: Partial<Country>) => onChange({ ...v, ...p });
  return (
    <div className="intl-definition">
      <div className="intl-section-heading">
        <h3>
          {i("countryDefinition")} · {v.code}
        </h3>
        <span className="soft-tag">
          {i(v.isoAssigned ? "official" : "custom")}
        </span>
        <button type="button" onClick={onClose} aria-label={i("close")}>
          ×
        </button>
      </div>
      <div className="customer-field-grid">
        {(["code", "alpha3", "numeric"] as const).map((k, n) => (
          <label key={k}>
            {i((["isoCode", "alpha3", "numericCode"] as const)[n])}
            <input
              maxLength={k === "code" ? 2 : 3}
              disabled={v.isoAssigned}
              value={v[k]}
              onChange={(e) => set({ [k]: e.target.value.toUpperCase() })}
            />
          </label>
        ))}
        <label>
          {i("continent")}
          <select
            value={v.continent}
            onChange={(e) => set({ continent: e.target.value })}
          >
            {["AF", "AN", "AS", "EU", "NA", "OC", "SA"].map((c) => (
              <option key={c} value={c}>
                {i(c as "EU")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TranslationFields
        nameOnly
        value={toText(v.name)}
        locales={config.locales}
        mainLocale={config.mainLocale}
        onChange={(text) => set({ name: toNames(text) })}
      />
      <div className="intl-section-heading">
        <h3>
          {i("regions")} · {v.states.length}
        </h3>
        <button
          type="button"
          className="studio-secondary"
          disabled={v.code.length !== 2}
          onClick={() => {
            set({ states: [...v.states, { code: `${v.code}-`, name: {} }] });
            setRegion(v.states.length);
          }}
        >
          + {i("add")}
        </button>
      </div>
      <div className="intl-region-list">
        {v.states.map((s, n) => (
          <button
            type="button"
            aria-pressed={region === n}
            key={n}
            onClick={() => setRegion(n)}
          >
            {s.name[locale.split("-")[0]] ?? s.name.en ?? s.code}
            <small>{s.code}</small>
          </button>
        ))}
      </div>
      {region != null && v.states[region] && (
        <div className="intl-definition">
          <label>
            {i("regionCode")}
            <input
              maxLength={12}
              value={v.states[region].code}
              onChange={(e) =>
                set({
                  states: v.states.map((s, n) =>
                    n === region
                      ? { ...s, code: e.target.value.toUpperCase() }
                      : s,
                  ),
                })
              }
            />
          </label>
          <TranslationFields
            nameOnly
            value={toText(v.states[region].name)}
            locales={config.locales}
            mainLocale={config.mainLocale}
            onChange={(text) =>
              set({
                states: v.states.map((s, n) =>
                  n === region ? { ...s, name: toNames(text) } : s,
                ),
              })
            }
          />
          <button
            type="button"
            className="studio-secondary"
            onClick={() => {
              set({ states: v.states.filter((_, n) => n !== region) });
              setRegion(null);
            }}
          >
            {i("remove")}
          </button>
        </div>
      )}
      <button
        type="button"
        className="studio-primary"
        disabled={
          !/^[A-Z]{2}$/.test(v.code) ||
          !Object.keys(v.name).length ||
          v.states.some((s) => !s.name || !Object.keys(s.name).length)
        }
        onClick={onSave}
      >
        {i("extend")}
      </button>
    </div>
  );
}
