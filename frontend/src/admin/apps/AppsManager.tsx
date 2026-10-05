/** Installed package workspace: lifecycle, generated entities and shared agent actions. */
import type { Package } from "./app-types";
import AppDetails from "./AppDetails";

import { useEffect, useState } from "react";
import { useAppText } from "../../shared/i18n/app-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useLibraryText } from "../../shared/i18n/app-library-i18n";
import AppLibrary from "./AppLibrary";
import { appCategory } from "./library-model";
import "../../shared/styles/apps.css";
import "../styles/app-catalog.css";
import "../styles/app-detail.css";
import "../styles/app-artwork.css";
import type { RequestFn } from "../shell/studio-types";
export default function AppsManager({
  request,
  role,
}: {
  request: RequestFn;
  token: string;
  role: string;
}) {
  const { a, locale, money } = useAppText();
  const { c } = useCustomerText();
  const l = useLibraryText();
  const [mainLocale, setMainLocale] = useState("en-GB");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [detailTab, setDetailTab] = useState("appDetails");
  const [packages, setPackages] = useState<Package[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultApp, setResultApp] = useState("");
  const [result, setResult] = useState<{
    elements: {
      orderId: string;
      items: {
        referencedId: string;
        quantity: number;
        configuration?: {
          text?: string;
          fields?: Record<string, string>;
          feeMinor: number;
        };
        appConfigurations?: {
          app: string;
          fields: Record<string, string>;
          feeMinor: number;
        }[];
      }[];
    }[];
  }>();
  const load = async () => {
    const data = await request("/api/apps");
    setPackages(data.packages);
    setMainLocale(data.mainLocale ?? "en-GB");
    dispatchEvent(new Event("commerce.apps.changed"));
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    request("/api/apps")
      .then((v) => {
        if (active) {
          setPackages(v.packages);
          setMainLocale(v.mainLocale ?? "en-GB");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const manage = ["owner", "admin"].includes(role);
  return (
    <div className="studio-page app-workspace">
      {!selected && (
        <div className="page-intro app-library-intro">
          <span className="kicker">{a("apps")}</span>
          <h1>{l("heading")}</h1>
          <p>{l("intro")}</p>
        </div>
      )}
      {error && (
        <div role="alert" className="app-library-error">
          <p>{error}</p>
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={() => void run(async () => {})}
          >
            {l("retry")}
          </button>
        </div>
      )}
      <div hidden={Boolean(selected)}>
        <AppLibrary
          packages={packages}
          mainLocale={mainLocale}
          loading={loading}
          manage={manage}
          busy={busy}
          onOpen={(id) => {
            setSelected(id);
            setDetailTab("appDetails");
            setResult(undefined);
          }}
          onInstall={(id) =>
            void run(
              async () => {
                await request("/api/apps", { builtIn: id });
              },
              () => {
                setSelected(id);
                setDetailTab("appDetails");
                setResult(undefined);
              },
            )
          }
        />
      </div>
      {selected && (
        <>
          <button
            className="studio-secondary app-back"
            onClick={() => {
              setSelected("");
              setResult(undefined);
            }}
          >
            ← {c("backApps")}
          </button>
          <div className="app-detail-tabs">
            {["appDetails", "appInterface", "appData", "appVersion"].map(
              (k) => (
                <button
                  key={k}
                  aria-pressed={detailTab === k}
                  className={
                    detailTab === k ? "studio-primary" : "studio-secondary"
                  }
                  onClick={() => setDetailTab(k)}
                >
                  {c(k)}
                </button>
              ),
            )}
          </div>
        </>
      )}
      {packages
        .filter((p) => p.id === selected)
        .map((p) => (
          <AppDetails
            p={p}
            locale={locale}
            mainLocale={mainLocale}
            a={a}
            manage={manage}
            busy={busy}
            run={run}
            request={request}
            detailTab={detailTab}
            c={c}
            appCategory={appCategory}
            role={role}
            setResultApp={setResultApp}
            setResult={setResult}
          />
        ))}
      {result != null && (
        <section className="studio-card app-card">
          <h2>{a("actions")}</h2>
          {!result.elements.length && <p>{a("emptyOrders")}</p>}
          {result.elements.flatMap((order) =>
            order.items.flatMap((row) => {
              const configs =
                row.appConfigurations?.filter((c) => c.app === resultApp) ??
                (row.configuration ? [row.configuration] : []);
              return configs.map((c, i) => (
                <article key={`${order.orderId}:${row.referencedId}:${i}`}>
                  <strong>
                    {Object.values(
                      c.fields ?? { text: "text" in c ? c.text : "" },
                    ).join(" · ")}
                  </strong>
                  <p>
                    {row.quantity} × {row.referencedId} ·{" "}
                    {money(c.feeMinor / 100)}
                  </p>
                  <small>
                    {a("orderLabel")}: {order.orderId}
                  </small>
                </article>
              ));
            }),
          )}
        </section>
      )}
    </div>
  );
}
