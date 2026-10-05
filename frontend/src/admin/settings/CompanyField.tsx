/** One factual field with visible channel inheritance, an explicit reset and searchable geographic selection. */
import { useId } from "react";
import {
  useCompanyText,
  type CompanyWord,
} from "../../shared/i18n/company-i18n";
import CountryPicker from "../../shared/geography/CountryPicker";
import EntityPicker from "../../shared/geography/EntityPicker";
import {
  displayName,
  type CountryCatalogue,
} from "../../shared/geography/geography-types";
import { companyText, type CompanyData } from "./company-types";
export default function CompanyField({
  field,
  data,
  base,
  channel,
  world,
  onChange,
}: {
  field: CompanyWord;
  data: CompanyData;
  base: CompanyData;
  channel: boolean;
  world?: CountryCatalogue;
  onChange: (d: CompanyData) => void;
}) {
  const { co, locale } = useCompanyText(),
    id = useId();
  const inherited = channel && data[field] == null;
  const value = companyText(
    {
      ...base,
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)),
    },
    field,
  );
  const set = (text: string) =>
    onChange({
      ...data,
      [field]: text,
      ...(field === "country" ? { countryStateId: "" } : {}),
    });
  const country = companyText(
    {
      ...base,
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)),
    },
    "country",
  );
  return (
    <div className="company-field">
      <div className="company-field-label">
        <label htmlFor={id}>{co(field)}</label>
        {channel && (
          <button
            type="button"
            className="company-inheritance"
            aria-label={`${co("reset")} · ${co(field)}`}
            disabled={inherited}
            onClick={() =>
              onChange({
                ...data,
                [field]: null,
                ...(field === "country" ? { countryStateId: null } : {}),
              })
            }
          >
            {co(inherited ? "inherited" : "custom")}
          </button>
        )}
      </div>
      {field === "country" || field === "professionalCountry" ? (
        <CountryPicker
          inputId={id}
          label={co(field)}
          countries={world?.countries ?? []}
          mainLocale={world?.mainLocale}
          value={value ? [value] : []}
          onChange={(v) => set(v[0] ?? "")}
          single
        />
      ) : field === "countryStateId" ? (
        <EntityPicker
          inputId={id}
          label={co(field)}
          options={(
            world?.countries.find((c) => c.code === country)?.states ?? []
          ).map((s) => ({
            code: s.code,
            label: displayName(s.name, locale, world?.mainLocale),
          }))}
          value={value ? [value] : []}
          onChange={(v) => set(v[0] ?? "")}
          single
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={500}
          required={
            field === "name" ||
            (field === "street" &&
              !companyText(data, "address") &&
              !companyText(base, "address")) ||
            (field === "city" && !!companyText({ ...base, ...data }, "street"))
          }
          type={
            field === "email"
              ? "email"
              : field === "website" || field === "professionalRulesUrl"
                ? "url"
                : field === "phoneNumber"
                  ? "tel"
                  : "text"
          }
          onChange={(e) => set(e.target.value)}
        />
      )}
    </div>
  );
}
