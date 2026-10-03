/** Contact fields mirror the account API while access, identity and pricing remain separate. */
import { useCustomerText } from "../i18n/customer-i18n";
import type { Contact } from "./customer-types";
export default function CustomerFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Contact;
  onChange: (p: Contact) => void;
  disabled?: boolean;
}) {
  const { c } = useCustomerText();
  const parts = value.name?.split(" ") ?? [];
  value = {
    ...value,
    firstName: value.firstName || parts[0] || "",
    lastName: value.lastName || parts.slice(1).join(" "),
  };
  return (
    <div className="customer-field-grid">
      {(
        [
          "firstName",
          "lastName",
          "title",
          "salutationId",
          "company",
          "phoneNumber",
          "birthday",
        ] as const
      ).map((key) => (
        <label key={key}>
          {c(key)}
          <input
            disabled={disabled}
            type={key === "birthday" ? "date" : "text"}
            maxLength={200}
            value={value[key] ?? ""}
            onChange={(e) => {
              const next = {
                ...value,
                [key]:
                  key === "birthday" && !e.target.value ? null : e.target.value,
              };
              if (key === "firstName" || key === "lastName")
                next.name =
                  `${next.firstName ?? ""} ${next.lastName ?? ""}`.trim();
              onChange(next);
            }}
          />
        </label>
      ))}
      <label>
        {c("vatId")}
        <input
          disabled={disabled}
          value={value.vatIds?.join(", ") ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              vatIds: e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
    </div>
  );
}
