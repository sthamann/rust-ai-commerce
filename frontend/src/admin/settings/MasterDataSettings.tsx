/** Shared company record with grouped fields, revision-aware saves and localized draft feedback. */
import { useEffect } from "react";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { useStudioText } from "../../shared/i18n/studio-ui-i18n";
import Icon from "../../shared/ui/Icon";
import type { RequestFn } from "../shell/studio-types";
import { useSettingsDraft } from "./useSettingsDraft";
import SettingsSaveBar from "./SettingsSaveBar";
export default function MasterDataSettings({
  request,
  canWrite,
  onDirty,
}: {
  request: RequestFn;
  canWrite: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const { c } = useCustomerText(),
    { o } = useOperationsText(),
    { u } = useStudioText();
  const state = useSettingsDraft<Record<string, string>>(
    request,
    "/api/settings/master-data",
  );
  const { value, busy, error, dirty } = state;
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  const groups = [
    {
      title: u("identity"),
      hint: u("identityHint"),
      icon: "building" as const,
      fields: ["name", "address", "taxId", "registrationNumber"],
    },
    {
      title: u("contact"),
      hint: "",
      icon: "chat" as const,
      fields: ["email", "phoneNumber", "website"],
    },
    {
      title: u("bank"),
      hint: u("bankHint"),
      icon: "card" as const,
      fields: ["bankName", "iban", "bic"],
    },
  ];
  return (
    <section className="studio-card settings-panel">
      <header className="settings-panel-header">
        <span className="settings-panel-icon">
          <Icon name="building" size={22} />
        </span>
        <div>
          <h2>{c("masterData")}</h2>
          <p>{c("masterDataHint")}</p>
        </div>
        {value && (
          <span className="soft-tag">
            {c("revision")} {value.revision}
          </span>
        )}
      </header>
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
      {!value && !error && <p role="status">{o("loading")}</p>}
      {value && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canWrite) void state.save();
          }}
        >
          {groups.map((group) => (
            <fieldset
              key={group.title}
              className="settings-group"
              disabled={!canWrite || busy}
            >
              <legend>
                <Icon name={group.icon} size={17} />
                {group.title}
              </legend>
              {group.hint && <p>{group.hint}</p>}
              <div className="customer-field-grid">
                {group.fields.map((k) => (
                  <label
                    key={k}
                    className={k === "address" ? "settings-wide-field" : ""}
                  >
                    {k === "address"
                      ? c("companyAddress")
                      : k === "name" || k === "taxId"
                        ? o(k)
                        : k === "iban" || k === "bic"
                          ? k.toUpperCase()
                          : c(k)}
                    <input
                      type={
                        k === "email"
                          ? "email"
                          : k === "website"
                            ? "url"
                            : k === "phoneNumber"
                              ? "tel"
                              : "text"
                      }
                      value={value.data[k] ?? ""}
                      required={["name", "address", "taxId"].includes(k)}
                      maxLength={500}
                      onChange={(e) =>
                        state.change({ ...value.data, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <SettingsSaveBar {...state} canWrite={canWrite} />
        </form>
      )}
    </section>
  );
}
