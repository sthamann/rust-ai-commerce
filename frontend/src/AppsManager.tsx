/** Installed package workspace: lifecycle, generated entities and shared agent actions. */
import { useEffect, useState } from "react";
import { useAppText } from "./app-i18n";
import type { RequestFn } from "./studio-types";
import AppFrame from "./AppFrame";
import AppEntity, { type Entity } from "./AppEntity";
import { useCustomerText } from "./customer-i18n";
import "./apps.css";
type Package = {
  uiUrl?: string;
  id: string;
  version: string;
  active: boolean;
  revision: number;
  manifest: {
    name: Record<string, string>;
    category?: string;
    permissions: string[];
    entities: Entity[];
    actions: { name: string; description: string; handler: string }[];
  };
};
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
  const load = async () => setPackages((await request("/api/apps")).packages);
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
        {["engraving", "paypal", "shopware_payments", "storyfront"]
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
                    : "Shopware Payments"}
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
          <section className="studio-card app-card" key={p.id}>
            <header>
              <div>
                <h2>
                  {p.manifest.name[locale.slice(0, 2)] ??
                    p.manifest.name.en ??
                    p.id}
                </h2>
                <span>
                  {p.version} · {a(p.active ? "active" : "inactive")}
                </span>
              </div>
              <button
                className="studio-secondary"
                disabled={!manage || busy}
                onClick={() =>
                  void run(async () => {
                    await request(
                      `/api/apps/${p.id}`,
                      { active: !p.active, revision: p.revision },
                      "PUT",
                    );
                  })
                }
              >
                {a(p.active ? "disable" : "enable")}
              </button>
            </header>
            {detailTab === "appVersion" && (
              <dl>
                <dt>{c("appVersion")}</dt>
                <dd>
                  {p.version} · {p.revision}
                </dd>
                <dt>{c("appData")}</dt>
                <dd>
                  {p.manifest.entities.map((e) => e.name).join(", ") || "—"}
                </dd>
                <dt>{c("apiCategory")}</dt>
                <dd>
                  {p.manifest.actions.map((e) => e.name).join(", ") || "—"}
                </dd>
              </dl>
            )}
            {detailTab === "appDetails" && (
              <p>
                {c(`${appCategory(p)}Category`)} · {p.id} ·{" "}
                {p.manifest.actions.length} API/MCP
              </p>
            )}
            {detailTab === "appInterface" && p.active && p.uiUrl && (
              <AppFrame app={p.id} url={p.uiUrl} request={request} />
            )}
            {detailTab === "appData" &&
              p.active &&
              p.manifest.entities.map((e) => (
                <AppEntity
                  key={e.name}
                  app={p.id}
                  entity={e}
                  request={request}
                  canWrite={role !== "viewer"}
                />
              ))}
            {detailTab === "appData" && p.active && (
              <div className="app-actions">
                {p.manifest.actions
                  .filter((act) => act.handler === "configurations")
                  .map((act) => (
                    <button
                      className="studio-secondary"
                      key={act.name}
                      onClick={() =>
                        void run(async () => {
                          setResultApp(p.id);
                          setResult(
                            await request(
                              `/api/apps/${p.id}/actions/${act.name}`,
                              {},
                            ),
                          );
                        })
                      }
                    >
                      {act.handler === "configurations"
                        ? a("personalizedOrders")
                        : act.description}
                    </button>
                  ))}
              </div>
            )}
          </section>
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
