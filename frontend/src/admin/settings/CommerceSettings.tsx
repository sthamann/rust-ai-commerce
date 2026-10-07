/** One revisioned international settings aggregate: drafts survive navigation between countries, taxes, methods and languages. */
import CurrencySettings from "./CurrencySettings";
import { useCurrencyText } from "../../shared/i18n/currency-i18n";
import EntityHistory from "../../shared/history/EntityHistory";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import { useWorkspaceText } from "../../shared/i18n/workspace-i18n";
import { useCompanyContext } from "./useCompanyContext";
import { useEffect, useRef, useState } from "react";
import type { Config } from "../../shared/api/shop-api";
import type {
  Country,
  CountryCatalogue,
} from "../../shared/geography/geography-types";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { RequestFn } from "../shell/studio-types";
import { useSettingsDraft } from "./useSettingsDraft";
import SettingsSaveBar from "./SettingsSaveBar";
import CountriesSettings from "./CountriesSettings";
import TaxSettings from "./TaxSettings";
import MethodSettings from "./MethodSettings";
import LanguageSettings from "./LanguageSettings";
import "../styles/international.css";
import "../styles/international-details.css";
export type InternationalConfig = Config & {
  mainLocale: string;
  locales: string[];
  countryDefinitions: Country[];
};
export type InternationalProps = {
  config: InternationalConfig;
  patch: (data: Partial<InternationalConfig>) => void;
  countries: Country[];
  request: RequestFn;
  channel?: boolean;
};
export default function CommerceSettings({
  request,
  area,
  canWrite,
  onDirty,
  initialChannel = "",
}: {
  request: RequestFn;
  area:
    "taxes" | "countries" | "shipping" | "payment" | "languages" | "currencies";
  canWrite: boolean;
  onDirty?: (dirty: boolean) => void;
  initialChannel?: string;
}) {
  const { c: ct } = useCurrencyText();
  const { i, locale } = useInternationalText();
  const { w } = useWorkspaceText();
  const [channel, setChannel] = useState(initialChannel);
  const [contentLanguage, setContentLanguage] = useState<string>();
  const [scopeError, setScopeError] = useState("");
  const context = useCompanyContext(request);
  const path = channel
    ? `/api/merchant/commerce/channels/${encodeURIComponent(channel)}`
    : "/api/merchant/commerce";
  const state = useSettingsDraft<
    Config,
    { inherited?: Config; baseRevision?: number; overrides?: unknown[] }
  >(request, path);
  const [world, setWorld] = useState<Country[]>([]);
  const [loadError, setLoadError] = useState("");
  const current = useRef(request);
  current.current = request;
  useEffect(() => {
    onDirty?.(state.dirty);
  }, [state.dirty, onDirty]);
  useEffect(() => {
    let active = true;
    current
      .current("/store-api/countries")
      .then((v: CountryCatalogue) => {
        if (!Array.isArray(v.countries))
          throw new Error(i("loadCountriesError"));
        if (active) setWorld(v.countries);
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!state.value)
    return (
      <p role={state.error ? "alert" : "status"}>
        {state.error || i("loading")}
      </p>
    );
  const config: InternationalConfig = {
    mainLocale: "en-GB",
    locales: ["en-GB", "de-DE", "es-ES", "fr-FR"],
    countryDefinitions: [],
    ...state.value.data,
  };
  const countries = [
    ...world.filter(
      (c) => !config.countryDefinitions.some((v) => v.code === c.code),
    ),
    ...config.countryDefinitions,
  ].sort((a, b) => a.code.localeCompare(b.code));
  const patch = (v: Partial<InternationalConfig>) =>
    state.change({ ...config, ...v });
  const props = { config, patch, countries, request, channel: !!channel };
  const missing = config.countries.filter(
    (code) =>
      config.taxes.some(
        (t) => t.rates[code] == null && t.defaultRate == null,
      ) ||
      !config.shipping.some((s) => s.active && s.countries.includes(code)) ||
      !config.payments.some(
        (p) =>
          p.active &&
          !p.businessOnly &&
          ((!p.restrictedCountries && !p.countries?.length) ||
            p.countries?.includes(code)),
      ),
  );
  return (
    <ContentLanguage
      locales={config.locales}
      mainLocale={config.mainLocale}
      language={contentLanguage}
      onLanguageChange={setContentLanguage}
    >
      <section className="studio-card settings-panel intl-panel">
        <header className="settings-panel-header">
          <div>
            <h2>{area === "currencies" ? ct("title") : i(area)}</h2>
            <p>
              {area === "currencies"
                ? ct("hint")
                : i(
                    area === "countries"
                      ? "countriesHint"
                      : area === "taxes"
                        ? "ruleHint"
                        : area === "languages"
                          ? "languageHint"
                          : "methodHint",
                  )}
            </p>
          </div>
          <span className="soft-tag">
            {i("revision")} {state.value.revision}
          </span>
        </header>
        <div className="intl-scope-bar">
          <label>
            {w("scope")}
            <select
              value={channel}
              disabled={!canWrite || state.busy}
              onChange={(e) => {
                if (state.dirty) {
                  setScopeError(w("pending"));
                  return;
                }
                setScopeError("");
                setChannel(e.target.value);
              }}
            >
              <option value="">{w("basis")}</option>
              {context.channels
                .filter((c) => c.id !== "default")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.data.name?.[locale] ??
                      c.data.name?.[locale.split("-")[0]] ??
                      c.data.name?.[config.mainLocale] ??
                      c.data.name?.[config.mainLocale.split("-")[0]] ??
                      Object.values(c.data.name ?? {})[0] ??
                      c.id}
                  </option>
                ))}
            </select>
          </label>
          <ContentLanguagePicker />
        </div>
        {channel && (
          <div className="intl-scope-note">
            <p>{w("scopeHint")}</p>
            <button
              type="button"
              className="studio-secondary"
              disabled={!canWrite || state.busy}
              onClick={() => {
                const basis = state.value?.inherited;
                if (!basis) return;
                const key = area === "payment" ? "payments" : area;
                state.change({ ...config, [key]: basis[key as keyof Config] });
              }}
            >
              {w("resetScope")}
            </button>
          </div>
        )}
        {scopeError && <p role="alert">{scopeError}</p>}
        {(state.error || loadError) && (
          <p role="alert" className="settings-error">
            {state.error || loadError}
          </p>
        )}
        {!!missing.length && (
          <div role="status" className="intl-coverage">
            <strong>{i("requiredCoverage")}</strong>
            <span>{missing.join(" · ")}</span>
            <p>{i("countryHint")}</p>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canWrite) void state.save();
          }}
        >
          <fieldset
            className="intl-fields"
            disabled={
              !canWrite || state.busy || (area === "languages" && !!channel)
            }
          >
            {area === "currencies" ? (
              <CurrencySettings
                {...props}
                revision={state.value.revision}
                dirty={state.dirty}
                reload={state.reload}
              />
            ) : area === "countries" ? (
              <CountriesSettings {...props} />
            ) : area === "taxes" ? (
              <TaxSettings {...props} />
            ) : area === "languages" ? (
              <LanguageSettings
                {...props}
                dirty={state.dirty}
                canWrite={canWrite}
              />
            ) : (
              <MethodSettings {...props} area={area} />
            )}
          </fieldset>
          <SettingsSaveBar {...state} canWrite={canWrite} />
        </form>
        <EntityHistory
          request={request}
          entity={channel ? "checkoutChannel" : "settings"}
          id={channel || "base"}
          revision={state.value.revision}
          dirty={state.dirty || state.busy}
          onRestored={state.reload}
        />
      </section>
    </ContentLanguage>
  );
}
