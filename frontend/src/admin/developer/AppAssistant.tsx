/** Guided app kinds create normal editable manifests; all changes follow private-stage versioning. */
import { useState } from "react";
import LocalizedField from "../../shared/i18n/LocalizedField";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import Icon, { type IconName } from "../../shared/ui/Icon";
import {
  useAssistantText,
  assistantText,
  type AssistantKey,
} from "../../shared/i18n/app-assistant-i18n";
import type { Manifest } from "../../shared/apps/native/types";
import {
  appKinds,
  assistedManifest,
  placements,
  type AppKind,
} from "./assistant-model";
import { textMap } from "./app-model";
const icons: Record<AppKind, IconName> = {
  frontend: "layers",
  admin: "code",
  combined: "spark",
  payment: "card",
  shipping: "truck",
  integration: "link",
  event: "pulse",
  webhook: "graph",
  scheduled: "pulse",
};
export default function AppAssistant({
  onCreate,
  onClose,
}: {
  onCreate: (m: Manifest) => void;
  onClose: () => void;
}) {
  const { t } = useAssistantText();
  const [kind, setKind] = useState<AppKind | null>(null),
    [name, setName] = useState<Manifest["name"]>(assistantText("admin")),
    [id, setId] = useState(`app_${Date.now().toString(36)}`),
    [location, setLocation] = useState("admin.product.tab"),
    [mcp, setMcp] = useState(false),
    [publish, setPublish] = useState(false),
    [event, setEvent] = useState("order.placed"),
    [cron, setCron] = useState("0 */15 * * * *");
  return (
    <section className="app-assistant" aria-label={t("start")}>
      <header>
        <div>
          <span className="kicker">
            <Icon name="spark" size={16} />
            {t("setup")}
          </span>
          <h2>{t(kind ? "setup" : "start")}</h2>
          <p>{t("hint")}</p>
        </div>
        <button
          type="button"
          className="app-icon-button"
          aria-label={t("cancel")}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {!kind ? (
        <div className="app-assistant-grid">
          {appKinds.map((k) => (
            <button
              type="button"
              key={k}
              className="app-kind-card"
              onClick={() => {
                setKind(k);
                setName(assistantText(k));
                setLocation(
                  k === "frontend" || k === "combined"
                    ? "product.detail"
                    : k === "admin"
                      ? "admin.product.tab"
                      : "admin.navigation",
                );
                setPublish(k === "frontend" || k === "combined");
              }}
            >
              <span className={`app-kind-icon app-kind-${k}`}>
                <Icon name={icons[k]} size={23} />
              </span>
              <strong>{t(k)}</strong>
              <span>{t(`${k}Hint` as AssistantKey)}</span>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(
              assistedManifest({
                kind,
                id,
                name,
                location,
                mcp,
                publicRead: publish,
                event,
                cron,
              }),
            );
          }}
        >
          <div className="app-assistant-fields">
            <ContentLanguagePicker />
            <LocalizedField
              label={t("title")}
              value={name}
              onChange={(v) => setName(textMap(v))}
              maxLength={100}
              required
            />
            <label>
              {t("appId")}
              <input
                required
                pattern="[a-z][a-z0-9_]{0,31}"
                maxLength={32}
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </label>
            <label>
              {t("placement")}
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {Object.entries(placements)
                  .filter(([v]) =>
                    ["frontend", "combined"].includes(kind)
                      ? ["product.detail", "storefront.page"].includes(v)
                      : v.startsWith("admin."),
                  )
                  .map(([v, k]) => (
                    <option value={v} key={v}>
                      {t(k)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <fieldset className="app-assistant-access">
            <legend>{t("access")}</legend>
            <label className="app-check">
              <input
                type="checkbox"
                checked={mcp}
                onChange={(e) => setMcp(e.target.checked)}
              />
              {t("mcpAccess")}
            </label>
            <p>{t("mcpHint")}</p>
            {kind === "admin" && location.includes("product") && (
              <label className="app-check">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                />
                {t("storefrontAccess")}
              </label>
            )}
          </fieldset>
          {["payment", "shipping", "integration", "event"].includes(kind) && (
            <>
              <p className="app-assistant-note">{t("serviceNotice")}</p>
              <label>
                {t("eventName")}
                <input
                  required
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  pattern="[A-Za-z0-9_.]+"
                  maxLength={100}
                />
              </label>
            </>
          )}
          {kind === "scheduled" && (
            <label>
              {t("cron")}
              <input
                value={cron}
                required
                maxLength={100}
                onChange={(e) => setCron(e.target.value)}
              />
            </label>
          )}
          {kind === "webhook" && (
            <p className="app-assistant-note">{t("webhookNotice")}</p>
          )}
          <footer>
            <button
              type="button"
              className="studio-secondary"
              onClick={() => setKind(null)}
            >
              {t("back")}
            </button>
            <button className="studio-primary">
              <Icon name="plus" size={16} />
              {t("create")}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
