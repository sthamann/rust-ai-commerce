/** Structured accessible address editor; no hidden JSON or storefront-only duplicate model. */
import { useCustomerText } from "./customer-i18n";
import { fullAddress, type Address } from "./customer-types";
export default function AddressFields({
  value,
  onChange,
  countries,
  disabled = false,
}: {
  value?: Address | null;
  onChange: (a: Address) => void;
  countries: string[];
  disabled?: boolean;
}) {
  const { c, locale } = useCustomerText();
  const a = fullAddress(value);
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
          (
            {
              firstName: "given-name",
              lastName: "family-name",
              street: "address-line1",
              postalCode: "postal-code",
              city: "address-level2",
              phoneNumber: "tel",
              company: "organization",
            } as Record<string, string>
          )[key]
        }
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
        <label>
          {c("country")}
          <select
            value={a.country}
            onChange={(e) => set("country", e.target.value)}
          >
            {countries.map((v) => (
              <option key={v} value={v}>
                {new Intl.DisplayNames([locale], { type: "region" }).of(v) ?? v}
              </option>
            ))}
          </select>
        </label>
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
              "countryStateId",
              "title",
              "salutationId",
            ] as const
          ).map((k) => input(k))}
        </div>
      </details>
    </fieldset>
  );
}
