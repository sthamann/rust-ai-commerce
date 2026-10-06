/** Visual payment contracts use the same manifest as coding agents; onboarding uses the protected API. */
import { useEffect, useState } from "react";
import type { Manifest } from "../../shared/apps/native/types";
import type { RequestFn } from "../shell/studio-types";
import type { CountryCatalogue } from "../../shared/geography/geography-types";
import CountryPicker from "../../shared/geography/CountryPicker";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { usePaymentProviderText } from "../../shared/i18n/payment-provider-i18n";
import ProviderAccount from "../apps/ProviderAccount";
import { textMap, nextId } from "./app-model";
import { appText } from "../../shared/i18n/app-studio-i18n";
export default function AppPayments({
  manifest: m,
  onChange,
  request,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
  request: RequestFn;
}) {
  const t = usePaymentProviderText(),
    [geo, setGeo] = useState<CountryCatalogue>();
  useEffect(() => {
    let active = true;
    void request("/store-api/countries")
      .then((v) => {
        if (active) setGeo(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request]);
  const patch = (
    methods: NonNullable<Manifest["paymentProvider"]>["methods"],
  ) => onChange({ ...m, paymentProvider: { apiVersion: "1", methods } });
  const add = () => {
    onChange({
      ...m,
      runtime: "service",
      category: "payment",
      permissions: [...new Set([...m.permissions, "payments.provider"])],
      paymentProvider: {
        apiVersion: "1",
        methods: [
          ...(m.paymentProvider?.methods ?? []),
          {
            id: nextId(
              "method",
              m.paymentProvider?.methods.map((v) => v.id) ?? [],
            ),
            name: appText("payments"),
            currencies: ["EUR"],
            countries: [],
            capabilities: ["capture", "refund"],
            checkout: "redirect",
            intent: "capture",
          },
        ],
      },
    });
  };
  return (
    <div className="app-connections">
      <section className="app-model-card">
        <header>
          <h2>{t("title")}</h2>
        </header>
        <p>{t("hint")}</p>
        <p>{t("deploy")}</p>
        {(m.paymentProvider?.methods ?? []).map((method, index) => (
          <section className="app-model-card" key={index}>
            <label>
              {t("id")}
              <input
                value={method.id}
                maxLength={32}
                onChange={(e) =>
                  patch(
                    m.paymentProvider!.methods.map((v, n) =>
                      n === index ? { ...v, id: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <LocalizedField
              label={t("name")}
              value={method.name}
              onChange={(v) =>
                patch(
                  m.paymentProvider!.methods.map((it, n) =>
                    n === index ? { ...it, name: textMap(v) } : it,
                  ),
                )
              }
            />
            <label>
              {t("currency")}
              <input
                value={method.currencies.join(", ")}
                onChange={(e) =>
                  patch(
                    m.paymentProvider!.methods.map((v, n) =>
                      n === index
                        ? {
                            ...v,
                            currencies: e.target.value
                              .toUpperCase()
                              .split(",")
                              .map((c) => c.trim())
                              .filter(Boolean),
                          }
                        : v,
                    ),
                  )
                }
              />
            </label>
            <CountryPicker
              countries={geo?.countries ?? []}
              value={method.countries}
              label={t("countries")}
              onChange={(countries) =>
                patch(
                  m.paymentProvider!.methods.map((v, n) =>
                    n === index ? { ...v, countries } : v,
                  ),
                )
              }
            />
            <label>
              {t("checkout")}
              <select
                value={method.checkout}
                onChange={(e) =>
                  patch(
                    m.paymentProvider!.methods.map((v, n) =>
                      n === index
                        ? {
                            ...v,
                            checkout: e.target.value as "redirect" | "embedded",
                          }
                        : v,
                    ),
                  )
                }
              >
                {(["redirect", "embedded"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("intent")}
              <select
                value={method.intent}
                onChange={(e) =>
                  patch(
                    m.paymentProvider!.methods.map((v, n) =>
                      n === index
                        ? {
                            ...v,
                            intent: e.target.value as "capture" | "authorize",
                          }
                        : v,
                    ),
                  )
                }
              >
                {(["capture", "authorize"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </label>
            <div className="app-tool-grid">
              {(
                [
                  "capture",
                  "authorize",
                  "void",
                  "refund",
                  "recurring",
                  "vault",
                ] as const
              ).map((k) => (
                <label className="app-check" key={k}>
                  <input
                    type="checkbox"
                    checked={method.capabilities.includes(k)}
                    onChange={(e) =>
                      patch(
                        m.paymentProvider!.methods.map((v, n) =>
                          n === index
                            ? {
                                ...v,
                                capabilities: e.target.checked
                                  ? [...v.capabilities, k]
                                  : v.capabilities.filter((c) => c !== k),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                  {t(k)}
                </label>
              ))}
            </div>
            <button
              className="studio-secondary"
              onClick={() =>
                patch(m.paymentProvider!.methods.filter((_, n) => n !== index))
              }
            >
              {t("remove")}
            </button>
          </section>
        ))}
        <button
          className="studio-secondary"
          onClick={add}
          disabled={(m.paymentProvider?.methods.length ?? 0) >= 32}
        >
          {t(m.paymentProvider ? "add" : "enable")}
        </button>
      </section>
      {m.paymentProvider && (
        <ProviderAccount provider={m.id} request={request} />
      )}
    </div>
  );
}
