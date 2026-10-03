/** Installed package workspace: lifecycle, generated entities and shared agent actions. */
import type { Package } from "./app-types";
import AppDetails from "./AppDetails";

import { useEffect, useState } from "react";
import { useAppText } from "../../shared/i18n/app-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useEmailText } from "../../shared/i18n/email-i18n";
import "../../shared/styles/apps.css";
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
  const { e } = useEmailText();
  const [selected, setSelected] = useState("");
  const [category, setCategory] = useState("all");
  const [detailTab, setDetailTab] = useState("appDetails");
  const appCategory = (p: Package) =>
    p.manifest.category ??
    (p.id.includes("paypal") || p.id.includes("payments")
      ? "payment"
      : p.id === "storyfront"
        ? "design"
        : "commerce");
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
    setPackages((await request("/api/apps")).packages);
    dispatchEvent(new Event("commerce.apps.changed"));
  };
  useEffect(() => {
    let active = true;
    request("/api/apps")
      .then((v) => {
        if (active) setPackages(v.packages);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const manage = ["owner", "admin"].includes(role);
  return (
    <div className="studio-page app-workspace">
      <div className="page-intro">
        <span className="kicker">COMMERCE / APPS</span>
        <h1>{a("apps")}</h1>
        <p>{a("intro")}</p>
      </div>
      <div className="app-install">
        {[
          "engraving",
          "paypal",
          "shopware_payments",
          "storyfront",
          "google_analytics",
          "gmail",
          "slack",
          "email",
        ]
          .filter(
            (id) =>
              !packages.some((p) => p.id === id) ||
              (id === "engraving" &&
                packages.some((p) => p.id === id && p.version === "1.0.0")),
          )
          .map((id) => (
            <button
              className="studio-secondary"
              key={id}
              disabled={!manage || busy}
              onClick={() =>
                void run(async () => {
                  await request("/api/apps", { builtIn: id });
                })
              }
            >
              {a(packages.some((p) => p.id === id) ? "upgrade" : "install")} ·{" "}
              {id === "engraving"
                ? a("engraving")
                : id === "paypal"
                  ? "PayPal Sandbox"
                  : id === "storyfront"
                    ? "Storyfront"
                    : id === "shopware_payments"
                      ? "Shopware Payments"
                      : id === "google_analytics"
                        ? "Google Analytics"
                        : id === "gmail"
                          ? "Gmail"
                          : id === "email"
                            ? e("title")
                            : "Slack"}
            </button>
          ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {!selected ? (
        <>
          <div className="app-categories">
            {[
              "all",
              "commerce",
              "payment",
              "api",
              "ai",
              "design",
              "operations",
            ].map((k) => (
              <button
                className={
                  category === k ? "studio-primary" : "studio-secondary"
                }
                key={k}
                onClick={() => setCategory(k)}
              >
                {c(k === "all" ? "allApps" : `${k}Category`)}
              </button>
            ))}
          </div>
          <div className="app-catalog">
            {packages
              .filter((p) => category === "all" || appCategory(p) === category)
              .map((p) => (
                <button
                  className="studio-card app-catalog-card"
                  key={p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setDetailTab("appDetails");
                    setResult(undefined);
                  }}
                >
                  <span>{c(`${appCategory(p)}Category`)}</span>
                  <h2>
                    {p.manifest.name[locale.slice(0, 2)] ?? p.manifest.name.en}
                  </h2>
                  <p>
                    {p.version} · {a(p.active ? "active" : "inactive")}
                  </p>
                  <strong>{c("openApp")} →</strong>
                </button>
              ))}
          </div>
        </>
      ) : (
        <>
          <button
            className="studio-secondary"
            onClick={() => {
              setSelected("");
              setResult(undefined);
            }}
          >
            ← {c("backApps")}
          </button>
          <div className="app-categories">
            {["appDetails", "appInterface", "appData", "appVersion"].map(
              (k) => (
                <button
                  key={k}
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
