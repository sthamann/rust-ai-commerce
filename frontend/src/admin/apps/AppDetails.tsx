/** AppDetails: Installed app details, activation, version, data and isolated interface. */
import { useAppText } from "../../shared/i18n/app-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import type { Package } from "./app-types";

import AppFrame from "../../shared/apps/AppFrame";
import "../../shared/styles/apps.css";
import AppEntity from "./AppEntity";
import ConnectorPanel from "./ConnectorPanel";
import EmailPanel from "./EmailPanel";
export type AppDetailsProps = {
  p: Package;
  locale: ReturnType<typeof useAppText>["locale"];
  a: ReturnType<typeof useAppText>["a"];
  manage: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  request: import("../shell/studio-types").RequestFn;
  detailTab: string;
  c: ReturnType<typeof useCustomerText>["c"];
  appCategory: (p: Package) => string;
  role: string;
  setResultApp: React.Dispatch<React.SetStateAction<string>>;
  setResult: React.Dispatch<
    React.SetStateAction<
      | {
          elements: {
            orderId: string;
            items: {
              referencedId: string;
              quantity: number;
              configuration?:
                | {
                    text?: string | undefined;
                    fields?: Record<string, string> | undefined;
                    feeMinor: number;
                  }
                | undefined;
              appConfigurations?:
                | {
                    app: string;
                    fields: Record<string, string>;
                    feeMinor: number;
                  }[]
                | undefined;
            }[];
          }[];
        }
      | undefined
    >
  >;
};
export default function AppDetails({
  p,
  locale,
  a,
  manage,
  busy,
  run,
  request,
  detailTab,
  c,
  appCategory,
  role,
  setResultApp,
  setResult,
}: AppDetailsProps) {
  return (
    <section className="studio-card app-card" key={p.id}>
      <header>
        <div>
          <h2>
            {p.manifest.name[locale.slice(0, 2)] ?? p.manifest.name.en ?? p.id}
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
          <dd>{p.manifest.entities.map((e) => e.name).join(", ") || "—"}</dd>
          <dt>{c("apiCategory")}</dt>
          <dd>{p.manifest.actions.map((e) => e.name).join(", ") || "—"}</dd>
        </dl>
      )}
      {detailTab === "appDetails" &&
        p.active &&
        ["google_analytics", "gmail", "slack"].includes(p.id) && (
          <ConnectorPanel app={p.id} request={request} manage={manage} />
        )}
      {detailTab === "appDetails" && p.active && p.id === "email" && (
        <EmailPanel request={request} manage={manage} />
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
  );
}
