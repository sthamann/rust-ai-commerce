/** Structured company profile with single-language content, inherited channel scopes, logo drafts and revision-bound saves. */
import { useEffect, useState } from "react";
import {
  useCompanyText,
  type CompanyWord,
} from "../../shared/i18n/company-i18n";
import { useStudioText } from "../../shared/i18n/studio-ui-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import { displayName } from "../../shared/geography/geography-types";
import type { RequestFn } from "../shell/studio-types";
import { useSettingsDraft } from "./useSettingsDraft";
import { useCompanyContext } from "./useCompanyContext";
import {
  companyText,
  type CompanyData,
  type CompanyContext,
} from "./company-types";
import CompanyField from "./CompanyField";
import CompanyLogo from "./CompanyLogo";
import CompanyTranslations from "./CompanyTranslations";
import SettingsSaveBar from "./SettingsSaveBar";
import "../styles/company-settings.css";
const groups: {
  title: CompanyWord;
  hint?: CompanyWord;
  fields: CompanyWord[];
}[] = [
  {
    title: "address",
    hint: "addressHint",
    fields: [
      "street",
      "houseNumber",
      "additionalAddressLine1",
      "additionalAddressLine2",
      "postalCode",
      "city",
      "country",
      "countryStateId",
    ],
  },
  {
    title: "legal",
    hint: "legalHint",
    fields: [
      "legalForm",
      "registerType",
      "registrationNumber",
      "registerCourt",
      "managingDirectors",
      "legalRepresentatives",
      "contentResponsible",
      "contentResponsibleAddress",
      "taxId",
      "vatId",
      "economicId",
    ],
  },
  { title: "contact", fields: ["email", "phoneNumber", "website"] },
  { title: "bank", fields: ["bankName", "iban", "bic"] },
];
export default function MasterDataSettings({
  request,
  canWrite,
  onDirty,
}: {
  request: RequestFn;
  canWrite: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const { c } = useCustomerText();
  const { co, locale } = useCompanyText(),
    { u } = useStudioText(),
    { o } = useOperationsText();
  const [uploading, setUploading] = useState(false);
  const [scope, setScope] = useState(""),
    [pending, setPending] = useState<string>();
  const state = useSettingsDraft<CompanyData, CompanyContext>(
    request,
    scope
      ? `/api/settings/master-data/channels/${scope}`
      : "/api/settings/master-data",
  );
  const context = useCompanyContext(request),
    { value, dirty, busy, error } = state;
  useEffect(() => {
    onDirty?.(dirty || uploading);
  }, [dirty, uploading, onDirty]);
  const base = value?.inherited ?? {},
    data = value?.data ?? {};
  const effective = {
    ...base,
    ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)),
  };
  const field = (key: CompanyWord) => (
    <CompanyField
      key={key}
      field={key}
      data={data}
      base={base}
      channel={!!scope}
      world={context.world}
      onChange={state.change}
    />
  );
  return (
    <section className="studio-card settings-panel company-panel">
      <header className="settings-panel-header">
        <div>
          <h2>{co("company")}</h2>
          <p>{co("scopeHint")}</p>
        </div>
        {value && (
          <span className="soft-tag">
            {c("revision")} {value.revision}
          </span>
        )}
      </header>
      <div className="company-scope">
        <label>
          {co("scope")}
          <select
            value={scope}
            disabled={busy || uploading}
            onChange={(e) => {
              if (dirty) setPending(e.target.value);
              else setScope(e.target.value);
            }}
          >
            <option value="">{co("basis")}</option>
            {context.channels.map((c) => (
              <option key={c.id} value={c.id}>
                {displayName(c.data.name, locale, context.world?.mainLocale)}
              </option>
            ))}
          </select>
        </label>
        <span className="soft-tag">{co(scope ? "custom" : "basis")}</span>
      </div>
      {pending !== undefined && (
        <div role="alert" className="company-scope-warning">
          <p>{co("discardScope")}</p>
          <button type="button" onClick={() => setPending(undefined)}>
            {u("keepEditing")}
          </button>
          <button
            type="button"
            onClick={() => {
              setScope(pending);
              setPending(undefined);
            }}
          >
            {u("discard")}
          </button>
        </div>
      )}
      {(error || context.error) && (
        <p role="alert" className="settings-error">
          {error || co("loadError")}
        </p>
      )}
      {!value && !error && <p>{o("loading")}</p>}
      {value && (
        <ContentLanguage
          locales={context.world?.locales ?? ["en-GB"]}
          mainLocale={context.world?.mainLocale ?? "en-GB"}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canWrite && !uploading) void state.save();
            }}
          >
            <fieldset className="settings-group" disabled={!canWrite || busy}>
              <legend>{co("company")}</legend>
              <div className="customer-field-grid">{field("name")}</div>
              <CompanyLogo
                key={scope}
                id={companyText(effective, "logoId")}
                request={request}
                onBusyChange={setUploading}
                onChange={(id) => state.change({ ...data, logoId: id })}
              />
              {scope && (
                <button
                  type="button"
                  className="company-inheritance"
                  disabled={data.logoId == null}
                  onClick={() => state.change({ ...data, logoId: null })}
                >
                  {co("reset")} · {co("logo")}
                </button>
              )}
            </fieldset>
            {groups.map((group) => (
              <fieldset
                className="settings-group"
                key={group.title}
                disabled={!canWrite || busy}
              >
                <legend>{co(group.title)}</legend>
                {group.hint && <p>{co(group.hint)}</p>}
                {group.title === "address" &&
                  companyText(effective, "address") &&
                  !companyText(effective, "street") && (
                    <aside className="company-legacy">
                      <strong>{companyText(effective, "address")}</strong>
                      <p>{co("legacy")}</p>
                    </aside>
                  )}
                <div className="customer-field-grid">
                  {group.fields.map(field)}
                </div>
              </fieldset>
            ))}
            <details className="company-additional">
              <summary>
                {co("supervisoryAuthority")} · {co("professionalTitle")} ·{" "}
                {co("shareCapital")}
              </summary>
              <fieldset className="settings-group" disabled={!canWrite || busy}>
                <div className="customer-field-grid">
                  {(
                    [
                      "supervisoryAuthority",
                      "professionalChamber",
                      "professionalTitle",
                      "professionalCountry",
                      "professionalRulesUrl",
                      "shareCapital",
                      "outstandingCapital",
                      "liquidationNotice",
                    ] as CompanyWord[]
                  ).map(field)}
                </div>
              </fieldset>
            </details>
            <fieldset className="settings-group" disabled={!canWrite || busy}>
              <legend>{co("publicText")}</legend>
              <ContentLanguagePicker />
              <CompanyTranslations
                data={data}
                base={base}
                channel={!!scope}
                onChange={state.change}
              />
            </fieldset>
            <SettingsSaveBar
              {...state}
              busy={busy || uploading}
              canWrite={canWrite}
            />
          </form>
        </ContentLanguage>
      )}
    </section>
  );
}
