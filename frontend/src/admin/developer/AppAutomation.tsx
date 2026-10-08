/** Editable triggers are declared alongside UI and actions; secrets remain operator-managed. */
import { useAssistantText } from "../../shared/i18n/app-assistant-i18n";
import type { Manifest } from "../../shared/apps/native/types";
import AppEvents from "./AppEvents";
import Icon from "../../shared/ui/Icon";
export default function AppAutomation({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { t } = useAssistantText();
  const schedules = manifest.schedules ?? [],
    webhooks = manifest.webhooks ?? [];

  return (
    <section className="app-model-card">
      <header>
        <Icon name="pulse" />
        <h2>{t("automation")}</h2>
      </header>
      <AppEvents manifest={manifest} onChange={onChange} />
      {schedules.map((s, i) => (
        <div className="app-access-row" key={s.id}>
          <code>{`app.${manifest.id}.${s.action}`}</code>
          <label>
            {t("cron")}
            <input
              value={s.cron}
              maxLength={100}
              onChange={(e) =>
                onChange({
                  ...manifest,
                  schedules: schedules.map((x, n) =>
                    n === i ? { ...x, cron: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <label className="app-check">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) =>
                onChange({
                  ...manifest,
                  schedules: schedules.map((x, n) =>
                    n === i ? { ...x, enabled: e.target.checked } : x,
                  ),
                })
              }
            />
            {t("trigger")}
          </label>
        </div>
      ))}
      {webhooks.map((w) => (
        <div key={w.id}>
          <code>{`/webhooks/apps/{shop}/${manifest.id}/${w.id}`}</code>
          <p>{t("webhookNotice")}</p>
        </div>
      ))}
    </section>
  );
}
