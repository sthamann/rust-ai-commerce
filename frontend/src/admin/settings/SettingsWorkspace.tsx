/** Independent settings workspace: grouped navigation, explicit dirty-draft guards and native API forms. */
import { useCrmText } from "../../shared/i18n/crm-i18n";
import LegalSettings from "../legal/LegalSettings";
import { useLegalText } from "../../shared/i18n/legal-i18n";
import CustomerGroupsSettings from "./CustomerGroupsSettings";
import { useState } from "react";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import { useStudioText } from "../../shared/i18n/studio-ui-i18n";
import Icon, { type IconName } from "../../shared/ui/Icon";
import type { RequestFn } from "../shell/studio-types";
import "../styles/settings.css";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import CommerceSettings from "./CommerceSettings";
import MasterDataSettings from "./MasterDataSettings";
type Area =
  | "masterData"
  | "taxes"
  | "countries"
  | "shipping"
  | "payment"
  | "languages"
  | "customerGroups"
  | "legal";
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
    { w } = useWorkbenchText(),
    { u } = useStudioText(),
    { i } = useInternationalText();
  const { r } = useCrmText();
  const { l } = useLegalText();
  const [area, setArea] = useState<Area>("masterData");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const navigate = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };
  const entries: { id: Area; label: string; hint: string; icon: IconName }[] = [
    {
      id: "masterData",
      label: c("masterData"),
      hint: u("companyHint"),
      icon: "building",
    },
    {
      id: "taxes",
      label: s("taxes"),
      hint: i("destinationRules"),
      icon: "percent",
    },
    {
      id: "languages",
      label: i("languages"),
      hint: i("languageHint"),
      icon: "globe",
    },
    {
      id: "countries",
      label: c("countries"),
      hint: u("countriesHint"),
      icon: "globe",
    },
    {
      id: "shipping",
      label: s("shipping"),
      hint: u("shippingHint"),
      icon: "truck",
    },
    {
      id: "customerGroups",
      label: r("groups"),
      hint: r("groupsHint"),
      icon: "people",
    },
    {
      id: "payment",
      label: s("payment"),
      hint: u("paymentHint"),
      icon: "card",
    },
    { id: "legal", label: l("title"), hint: l("hint"), icon: "lock" },
  ];
  return (
    <div className="studio-page operations settings-workspace">
      <div className="page-intro">
        <span className="kicker">{u("workspace")}</span>
        <h1>{c("settings")}</h1>
        <p>{u("settingsHint")}</p>
      </div>
      {pending && (
        <div className="settings-discard" role="alert">
          <p>{u("discardHint")}</p>
          <div>
            <button
              className="studio-secondary"
              onClick={() => setPending(null)}
            >
              {u("keepEditing")}
            </button>
            <button
              className="studio-primary"
              onClick={() => {
                setDirty(false);
                pending();
                setPending(null);
              }}
            >
              {u("discard")}
            </button>
          </div>
        </div>
      )}
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label={c("settings")}>
          <span className="settings-nav-label">{u("shopSettings")}</span>
          {entries.map((item) => (
            <button
              key={item.id}
              aria-current={area === item.id ? "page" : undefined}
              onClick={() => {
                if (area !== item.id) {
                  if (
                    !["masterData", "customerGroups", "legal"].includes(area) &&
                    !["masterData", "customerGroups", "legal"].includes(item.id)
                  )
                    setArea(item.id);
                  else navigate(() => setArea(item.id));
                }
              }}
            >
              <Icon name={item.icon} size={19} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
          <span className="settings-nav-label">{u("connectedAreas")}</span>
          {[
            {
              label: w("automation"),
              hint: u("automationHint"),
              icon: "graph" as const,
              action: onAutomation,
            },
            {
              label: t("users"),
              hint: u("teamHint"),
              icon: "people" as const,
              action: onTeam,
            },
            {
              label: c("providerConnections"),
              hint: u("aiHint"),
              icon: "spark" as const,
              action: onConnections,
            },
          ].map((item) => (
            <button key={item.label} onClick={() => navigate(item.action)}>
              <Icon name={item.icon} size={19} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              <Icon name="arrow" size={14} />
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {area === "masterData" ? (
            <MasterDataSettings
              request={request}
              canWrite={rights.includes("settings.write")}
              onDirty={setDirty}
            />
          ) : area === "legal" ? (
            <LegalSettings
              request={request}
              rights={rights}
              canWrite={rights.includes("settings.write")}
              onDirty={setDirty}
            />
          ) : area === "customerGroups" ? (
            <CustomerGroupsSettings
              request={request}
              canWrite={rights.includes("settings.write")}
              onDirty={setDirty}
            />
          ) : (
            <CommerceSettings
              request={request}
              area={area}
              canWrite={rights.includes("settings.write")}
              onDirty={setDirty}
            />
          )}
        </div>
      </div>
    </div>
  );
}
