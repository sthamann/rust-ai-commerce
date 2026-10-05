/** Delivery-country selection and editable catalogue definitions, including tenant-owned subdivisions. */
import { useState } from "react";
import CountryPicker from "../../shared/geography/CountryPicker";
import {
  displayName,
  type Country,
} from "../../shared/geography/geography-types";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import CountryDefinition from "./CountryDefinition";
import type { InternationalProps } from "./CommerceSettings";
export default function CountriesSettings({
  config,
  patch,
  countries,
  channel,
}: InternationalProps) {
  const { i, locale } = useInternationalText();
  const [editing, setEditing] = useState<Country | null>(null);
  return (
    <div className="intl-section">
      <div className="intl-metrics">
        <div>
          <strong>{countries.length}</strong>
          <span>{i("catalogue")}</span>
        </div>
        <div>
          <strong>{config.countries.length}</strong>
          <span>{i("deliveryCountries")}</span>
        </div>
        <div>
          <strong>
            {countries.find((c) => c.code === "US")?.states.length ?? 0}
          </strong>
          <span>{i("regions")} · US</span>
        </div>
      </div>
      <CountryPicker
        countries={countries}
        mainLocale={config.mainLocale}
        value={config.countries}
        label={i("deliveryCountries")}
        onChange={(codes) =>
          patch({
            countries: codes,
            shipping: config.shipping.map((s) => ({
              ...s,
              countries: s.countries.filter((c) => codes.includes(c)),
            })),
            payments: config.payments.map((p) => ({
              ...p,
              restrictedCountries:
                p.restrictedCountries || !!p.countries?.length,
              countries: (p.countries ?? []).filter((c) => codes.includes(c)),
            })),
          })
        }
      />
      <p className="intl-hint">{i("countryHint")}</p>
      <div className="intl-section-heading">
        <h3>{i("countryDefinition")}</h3>
        <button
          type="button"
          className="studio-secondary"
          disabled={channel}
          onClick={() =>
            setEditing({
              code: "",
              alpha3: "",
              numeric: "",
              isoAssigned: false,
              continent: "EU",
              name: {},
              states: [],
            })
          }
        >
          + {i("customCountry")}
        </button>
      </div>
      <CountryPicker
        countries={countries}
        value={editing?.code ? [editing.code] : []}
        single
        label={i("edit")}
        onChange={(codes) =>
          setEditing(
            structuredClone(countries.find((c) => c.code === codes[0])!),
          )
        }
      />
      {editing && (
        <CountryDefinition
          value={editing}
          config={config}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => {
            patch({
              countryDefinitions: [
                ...config.countryDefinitions.filter(
                  (c) => c.code !== editing.code,
                ),
                editing,
              ],
            });
            setEditing(null);
          }}
        />
      )}
      <div className="intl-country-grid">
        {config.countries.map((code) => {
          const country = countries.find((c) => c.code === code);
          return (
            <button
              type="button"
              key={code}
              onClick={() => country && setEditing(structuredClone(country))}
            >
              <span className="intl-country-code">{code}</span>
              <span>
                <strong>
                  {country
                    ? displayName(country.name, locale, config.mainLocale)
                    : code}
                </strong>
                <small>
                  {country?.alpha3} · {country?.numeric} ·{" "}
                  {country?.continent ? i(country.continent as "EU") : ""}
                </small>
              </span>
              <span>↗</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
