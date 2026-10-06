/** Structured accessible address editor; no hidden JSON or storefront-only duplicate model. */
import CountryPicker from "../geography/CountryPicker";
import EntityPicker from "../geography/EntityPicker";
import { displayName } from "../geography/geography-types";
import {
  useCountryCatalogue,
  type GeographyRequest,
} from "../geography/useCountryCatalogue";
import { useInternationalText } from "../i18n/international-i18n";
import { useCustomerText } from "../i18n/customer-i18n";
import { fullAddress, type Address } from "./customer-types";
export default function AddressFields({
  value,
  onChange,
  countries,
  disabled = false,
  request,
  autoCompleteSection,
}: {
  value?: Address | null;
  onChange: (a: Address) => void;
  countries: string[];
  disabled?: boolean;
  request?: GeographyRequest;
  autoCompleteSection?: "billing" | "shipping";
}) {
  const { c, locale } = useCustomerText();
  const { i } = useInternationalText();
  const geography = useCountryCatalogue(request);
  const a = fullAddress(value);
  const world = countries.map(
    (code) =>
      geography?.countries.find((c) => c.code === code) ?? {
        code,
        alpha3: "",
        numeric: "",
        isoAssigned: false,
        continent: "",
        name: {
          en:
            new Intl.DisplayNames([locale], { type: "region" }).of(code) ??
            code,
        },
        states: [],
      },
  );
  const regions = world.find((c) => c.code === a.country)?.states ?? [];
  const set = (key: string, val: string) => {
    const next = { ...a, [key]: val };
    if (key === "firstName" || key === "lastName")
      next.name = `${next.firstName ?? ""} ${next.lastName ?? ""}`.trim();
    onChange(next);
  };
  const input = (key: keyof Address, required = false) => (
    <label key={key}>
      {c(key)}
      <input
        disabled={disabled}
        required={required}
        maxLength={160}
        value={a[key] ?? ""}
        autoComplete={
          [
            "firstName",
            "lastName",
            "street",
            "postalCode",
            "city",
            "phoneNumber",
            "company",
          ].includes(key)
            ? `${autoCompleteSection ? `section-${autoCompleteSection} ${autoCompleteSection} ` : ""}${({ firstName: "given-name", lastName: "family-name", street: "address-line1", postalCode: "postal-code", city: "address-level2", phoneNumber: "tel", company: "organization" } as Record<string, string>)[key]}`
            : undefined
        }
        name={autoCompleteSection ? `${autoCompleteSection}-${key}` : key}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  return (
    <fieldset className="customer-address-fields" disabled={disabled}>
      <div className="customer-field-grid">
        {input("firstName", true)}
        {input("lastName", true)}
        {input("street", true)}
        {input("postalCode", true)}
        {input("city", true)}
        <CountryPicker
          countries={world}
          value={[a.country ?? "DE"]}
          single
          label={c("country")}
          disabled={disabled}
          mainLocale={geography?.mainLocale}
          onChange={(codes) =>
            onChange({ ...a, country: codes[0], countryStateId: "" })
          }
        />
        {!!regions.length && (
          <EntityPicker
            single
            disabled={disabled}
            label={i("region")}
            options={regions.map((s) => ({
              code: s.code,
              label: displayName(s.name, locale, geography?.mainLocale),
            }))}
            value={a.countryStateId ? [a.countryStateId] : []}
            onChange={(codes) => set("countryStateId", codes[0])}
          />
        )}
      </div>
      <details>
        <summary>{c("moreAddressFields")}</summary>
        <div className="customer-field-grid">
          {(
            [
              "company",
              "department",
              "vatId",
              "phoneNumber",
              "additionalAddressLine1",
              "additionalAddressLine2",
              "title",
              "salutationId",
            ] as const
          ).map((k) => input(k))}
        </div>
      </details>
    </fieldset>
  );
}
