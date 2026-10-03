/** Shared legal issuer/company record; issued documents keep their immutable original data. */
import { useEffect, useState } from "react";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import type { RequestFn } from "../shell/studio-types";
export default function MasterDataSettings({
  request,
  canWrite,
}: {
  request: RequestFn;
  canWrite: boolean;
}) {
  const { c } = useCustomerText(),
    { o } = useOperationsText();
  const [value, setValue] = useState<{
      data: Record<string, string>;
      revision: number;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    request("/api/settings/master-data")
      .then(setValue)
      .catch((e) => setError(e.message));
  }, [request]);
  return (
    <section className="studio-card">
      <h2>{c("masterData")}</h2>
      <p>{c("masterDataHint")}</p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{c("saved")}</p>}
      {value && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              await request("/api/settings/master-data", value, "PUT");
              setValue(await request("/api/settings/master-data"));
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="customer-field-grid">
            {[
              "name",
              "address",
              "taxId",
              "email",
              "phoneNumber",
              "website",
              "registrationNumber",
              "bankName",
              "iban",
              "bic",
            ].map((k) => (
              <label key={k}>
                {k === "address"
                  ? c("companyAddress")
                  : k === "name" || k === "taxId"
                    ? o(k)
                    : k === "iban" || k === "bic"
                      ? k.toUpperCase()
                      : c(k)}
                <input
                  disabled={!canWrite || busy}
                  value={value.data[k] ?? ""}
                  required={["name", "address", "taxId"].includes(k)}
                  maxLength={500}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      data: { ...value.data, [k]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
          {canWrite && (
            <button className="studio-primary" disabled={busy}>
              {c("save")}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
