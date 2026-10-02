/** Installed package workspace: lifecycle, generated entities and shared agent actions. */
import { useEffect, useState } from "react";
import { useAppText } from "./app-i18n";
import type { RequestFn } from "./studio-types";
import AppFrame from "./AppFrame";
import AppEntity, { type Entity } from "./AppEntity";
import PaymentManager from "./PaymentManager";
import "./apps.css";
type Package = {
  uiUrl?: string;
  id: string;
  version: string;
  active: boolean;
  revision: number;
  manifest: {
    name: Record<string, string>;
    entities: Entity[];
    actions: { name: string; description: string; handler: string }[];
  };
};
export default function AppsManager({
  request,
  token,
  role,
}: {
  request: RequestFn;
  token: string;
  role: string;
}) {
  const { a, locale, money } = useAppText();
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
        {["engraving", "paypal", "shopware_payments"]
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
                  : "Shopware Payments"}
            </button>
          ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {packages.map((p) => (
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
          {p.active && p.uiUrl && (
            <AppFrame app={p.id} url={p.uiUrl} request={request} />
          )}
          {p.active &&
            p.manifest.entities.map((e) => (
              <AppEntity
                key={e.name}
                app={p.id}
                entity={e}
                request={request}
                canWrite={role !== "viewer"}
              />
            ))}
          {p.active && (
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
      <PaymentManager request={request} token={token} canWrite={manage} />
    </div>
  );
}
