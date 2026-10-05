/** Geographical tax rule editor: country, subdivisions, postcode constraints, date window and persisted Rule Builder condition. */
import { useEffect, useRef, useState } from "react";
import CountryPicker from "../../shared/geography/CountryPicker";
import EntityPicker from "../../shared/geography/EntityPicker";
import {
  displayName,
  type DestinationRule,
  type Country,
} from "../../shared/geography/geography-types";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { RequestFn } from "../shell/studio-types";
import type { InternationalConfig } from "./CommerceSettings";
export default function DestinationRuleEditor({
  value: v,
  countries,
  config,
  request,
  onChange,
  onRemove,
}: {
  value: DestinationRule;
  countries: Country[];
  config: InternationalConfig;
  request: RequestFn;
  onChange: (r: DestinationRule) => void;
  onRemove: () => void;
}) {
  const { i, locale } = useInternationalText();
  const [rules, setRules] = useState<any[]>([]),
    [error, setError] = useState("");
  const current = useRef(request);
  current.current = request;
  useEffect(() => {
    let active = true;
    current
      .current("/api/automation")
      .then((v) => {
        if (active) setRules(v.elements ?? v.rules ?? []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const set = (x: Partial<DestinationRule>) => onChange({ ...v, ...x });
  const state = countries.find((c) => c.code === v.country)?.states ?? [];
  const reference =
    (v.condition as any)?.type === "ruleReference"
      ? (v.condition as any).ruleId
      : "";
  return (
    <div className="intl-definition">
      <CountryPicker
        label={i("country")}
        countries={countries}
        mainLocale={config.mainLocale}
        single
        value={[v.country]}
        onChange={(codes) => set({ country: codes[0], states: [] })}
      />
      {!!state.length && (
        <EntityPicker
          label={i("region")}
          options={state.map((s) => ({
            code: s.code,
            label: displayName(s.name, locale, config.mainLocale),
          }))}
          value={v.states}
          onChange={(states) => set({ states })}
        />
      )}
      <div className="intl-rule-grid">
        <label>
          {i("rate")}
          <input
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={v.rate}
            onChange={(e) => set({ rate: Number(e.target.value) })}
          />
        </label>
        <label>
          {i("priority")}
          <input
            type="number"
            step="1"
            value={v.priority}
            onChange={(e) => set({ priority: Number(e.target.value) })}
          />
        </label>
        {(["postalCodes", "postalPrefixes"] as const).map((k) => (
          <label key={k}>
            {i(k)}
            <input
              value={v[k].join(", ")}
              onChange={(e) =>
                set({
                  [k]: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        ))}
        {(["postalFrom", "postalTo", "activeFrom", "activeUntil"] as const).map(
          (k) => (
            <label key={k}>
              {i(k)}
              <input
                type={k.startsWith("active") ? "date" : "text"}
                value={v[k] ?? ""}
                onChange={(e) => set({ [k]: e.target.value || null })}
              />
            </label>
          ),
        )}
        <label>
          {i("ruleCondition")}
          <select
            value={reference}
            onChange={(e) =>
              set({
                condition: e.target.value
                  ? { type: "ruleReference", ruleId: e.target.value }
                  : null,
              })
            }
          >
            <option value="">{i("noCondition")}</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {displayName(
                  r.data?.name ?? r.name ?? { en: r.id },
                  locale,
                  config.mainLocale,
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="studio-secondary" onClick={onRemove}>
        {i("remove")}
      </button>
    </div>
  );
}
