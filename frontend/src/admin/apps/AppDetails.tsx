/** AppDetails: Installed app details, activation, version, data and isolated interface. */
import { useAppText } from "../../shared/i18n/app-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import type { Package } from "./app-types";

import StoryfrontConnections from "../storyfronts/StoryfrontConnections";
import { useStoryfrontText } from "../storyfronts/storyfront-i18n";
import AppInterfaces from "./AppInterfaces";
import AppArtwork from "./AppArtwork";
import { appName, appSummary } from "./library-model";
import { useLibraryText } from "../../shared/i18n/app-library-i18n";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { useState } from "react";
import "../../shared/styles/apps.css";
import AppEntity from "./AppEntity";
import ConnectorPanel from "./ConnectorPanel";
import ProviderAccount from "./ProviderAccount";
import EmailPanel from "./EmailPanel";
export type AppDetailsProps = {
  p: Package;
  mainLocale: string;
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
  mainLocale,
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
  const l = useLibraryText();
  const text = useStoryfrontText();
  const [confirm, setConfirm] = useState(false);
  const toggle = () =>
    void run(async () => {
      await request(
        `/api/apps/${p.id}`,
        { active: !p.active, revision: p.revision },
        "PUT",
      );
      setConfirm(false);
    });
  return (
    <section className="studio-card app-card app-detail" key={p.id}>
      <AppArtwork
        id={p.id}
        category={appCategory(p)}
        {...p.manifest.presentation}
      />
      <header className="app-detail-heading">
        <div>
          <span className="kicker">{c(`${appCategory(p)}Category`)}</span>
          <h1>{appName(p, locale, mainLocale)}</h1>
          <p>{appSummary(p, locale, mainLocale, l)}</p>
          <span className="app-status" data-active={p.active}>
            {l(p.active ? "enabled" : "disabled")}
          </span>
          <small> · {p.version}</small>
        </div>
        <button
          className="studio-secondary"
          disabled={!manage || busy || !!p.managedBy}
          onClick={() => (p.active ? setConfirm(true) : toggle())}
        >
          {p.managedBy ? text("managed") : a(p.active ? "disable" : "enable")}
        </button>
      </header>
      {confirm && (
        <ConfirmDialog
          title={l("pauseTitle")}
          confirmLabel={a("disable")}
          disabled={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={toggle}
        >
          <p>{l("pauseHint")}</p>
        </ConfirmDialog>
      )}
      <div className="app-detail-body">
        {p.managedBy && <p>{text("managedHint")}</p>}
        {detailTab === "appDetails" && !!p.connections?.length && (
          <StoryfrontConnections frontends={p.connections} />
        )}
        <div className="app-capabilities">
          {[
            [l("entities"), p.manifest.entities.length],
            [l("actions"), p.manifest.actions.length],
            [
              l("surfaces"),
              (p.manifest.surfaces?.length ?? 0) +
                (p.manifest.slots?.length ?? 0),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {!p.active && detailTab !== "appVersion" && (
          <p className="app-library-empty">{l("disabledHint")}</p>
        )}
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
        {detailTab === "appDetails" &&
          p.active &&
          p.manifest.paymentProvider && (
            <ProviderAccount
              provider={p.id}
              request={request}
              canWrite={manage}
            />
          )}
        {detailTab === "appDetails" && (
          <div className="app-contract-summary">
            <details>
              <summary>
                {l("permissions")} · {p.manifest.permissions.length}
              </summary>
              <ul>
                {p.manifest.permissions.map((v) => (
                  <li key={v}>
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary>
                {l("events")} · {p.manifest.events?.length ?? 0}
              </summary>
              {p.manifest.events?.length ? (
                <ul>
                  {p.manifest.events.map((v) => (
                    <li key={v}>
                      <code>{v}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{l("noEvents")}</p>
              )}
            </details>
            <small>
              {p.id} · {l("revision")} {p.revision}
            </small>
          </div>
        )}
        {detailTab === "appInterface" && p.active && (
          <AppInterfaces p={p} request={request} />
        )}
        {detailTab === "appData" && p.active && !p.manifest.entities.length && (
          <p className="app-library-empty">{l("noData")}</p>
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
                  {a("personalizedOrders")}
                </button>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
