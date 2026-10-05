/** One revisioned international settings aggregate: drafts survive navigation between countries, taxes, methods and languages. */
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
};
export default function CommerceSettings({
  request,
  area,
  canWrite,
  onDirty,
}: {
  request: RequestFn;
  area: "taxes" | "countries" | "shipping" | "payment" | "languages";
  canWrite: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const { i } = useInternationalText();
  const state = useSettingsDraft<Config>(request, "/api/merchant/commerce");
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
  const props = { config, patch, countries, request };
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
    <section className="studio-card settings-panel intl-panel">
      <header className="settings-panel-header">
        <div>
          <h2>{i(area)}</h2>
          <p>
            {i(
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
        <fieldset className="intl-fields" disabled={!canWrite || state.busy}>
          {area === "countries" ? (
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
    </section>
  );
}
