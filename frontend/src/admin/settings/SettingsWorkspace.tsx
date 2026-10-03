/** One settings entry groups shared master data and shop configuration; operational entities remain dedicated. */
import { useState } from "react";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { RequestFn } from "../shell/studio-types";
import CommerceSettings from "./CommerceSettings";
import MasterDataSettings from "./MasterDataSettings";
export default function SettingsWorkspace({
  request,
  rights,
  onConnections,
  onTeam,
  onAutomation,
}: {
  request: RequestFn;
  rights: string[];
  onConnections: () => void;
  onTeam: () => void;
  onAutomation: () => void;
}) {
  const { c } = useCustomerText(),
    { s, t } = useShopText(),
    { w } = useWorkbenchText();
  const [area, setArea] = useState<
    "masterData" | "taxes" | "countries" | "shipping" | "payment"
  >("masterData");
  return (
    <div className="studio-page operations settings-workspace">
      <div className="page-intro">
        <h1>{c("settings")}</h1>
        <p>{c("masterDataHint")}</p>
      </div>
      <div className="settings-layout">
        <nav aria-label={c("settings")}>
          {(
            ["masterData", "taxes", "countries", "shipping", "payment"] as const
          ).map((k) => (
            <button
              key={k}
              className={area === k ? "active" : ""}
              onClick={() => setArea(k)}
            >
              {k === "masterData" ? c(k) : s(k)}
            </button>
          ))}
          <button onClick={onAutomation}>
            {w("automation")} · {w("channels")}
          </button>
          <button onClick={onTeam}>{t("users")}</button>
          <button onClick={onConnections}>{c("providerConnections")}</button>
        </nav>
        <div>
          {area === "masterData" ? (
            <MasterDataSettings
              request={request}
              canWrite={rights.includes("settings.write")}
            />
          ) : (
            <CommerceSettings
              key={area}
              request={request}
              area={area}
              canWrite={rights.includes("settings.write")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
