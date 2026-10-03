/** Focused source action forms expose only supported native parameters; app service dispatch stays in the app gateway. */
import JsonField from "./JsonField";
import FlowInputs from "./FlowInputs";
import type { AutomationCatalog } from "./RuleBuilder";
import { useAutomationText } from "../../shared/i18n/automation-i18n";
export default function FlowActionFields({
  action,
  catalog,
  config,
  onChange,
}: {
  action: string;
  catalog?: AutomationCatalog;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const { a } = useAutomationText();
  const field = (key: string, type = "text") => (
    <label key={key}>
      {a(key)}
      <input
        type={type}
        value={config[key] ?? ""}
        onChange={(e) => onChange({ ...config, [key]: e.target.value })}
      />
    </label>
  );
  const fields = action.endsWith(".tag")
    ? ["tags"]
    : action.includes("custom.field")
      ? ["field"]
      : action.endsWith("affiliate.and.campaign.code")
        ? ["affiliateCode", "campaignCode"]
        : action === "action.change.customer.group"
          ? ["groupId"]
          : action === "action.set.order.state"
            ? ["kind", "state"]
            : action === "action.generate.document"
              ? ["kind"]
              : action === "action.mail.send"
                ? ["templateId"]
                : action === "app_action"
                  ? []
                  : [];
  return (
    <div className="flow-action-fields">
      {fields.map((k) =>
        k === "tags" ? (
          <label key={k}>
            {a("tags")}
            <input
              value={(config.tags ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  ...config,
                  tags: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        ) : (
          field(k)
        ),
      )}
      {["note", "ai_proposal"].includes(action) &&
        ["en", "de", "fr", "es"].map((lang) => (
          <label key={lang}>
            {a("instruction")} · {lang.toUpperCase()}
            <textarea
              value={config.instruction?.[lang] ?? ""}
              onChange={(e) =>
                onChange({
                  ...config,
                  instruction: {
                    ...config.instruction,
                    [lang]: e.target.value,
                  },
                })
              }
            />
          </label>
        ))}
      {action.includes("custom.field") && (
        <JsonField
          label={a("value")}
          value={config.value}
          onChange={(value) => onChange({ ...config, value })}
        />
      )}
      {action === "app_action" && (
        <div>
          <label>
            {a("app")}
            <select
              value={config.app ?? ""}
              onChange={(e) => {
                const app = catalog?.apps.find((a) => a.id === e.target.value);
                onChange({
                  app: e.target.value,
                  action:
                    app?.manifest.actions.find((a: any) => a.flowAllowed)
                      ?.name ?? "",
                  arguments: {},
                });
              }}
            >
              <option value="">—</option>
              {catalog?.apps
                .filter((a) =>
                  a.manifest.actions.some((x: any) => x.flowAllowed),
                )
                .map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.manifest.name.en ?? app.id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {a("action")}
            <select
              value={config.action ?? ""}
              onChange={(e) =>
                onChange({ ...config, action: e.target.value, arguments: {} })
              }
            >
              <option value="">—</option>
              {catalog?.apps
                .find((a) => a.id === config.app)
                ?.manifest.actions.filter((a: any) => a.flowAllowed)
                .map((item: any) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <FlowInputs
            key={`${config.app}:${config.action}`}
            action={catalog?.apps
              .find((a) => a.id === config.app)
              ?.manifest.actions.find((a: any) => a.name === config.action)}
            value={config.arguments ?? {}}
            onChange={(arguments_) =>
              onChange({ ...config, arguments: arguments_ })
            }
          />
        </div>
      )}
      {action === "action.grant.download.access" && (
        <label>
          <input
            type="checkbox"
            checked={config.value ?? true}
            onChange={(e) => onChange({ ...config, value: e.target.checked })}
          />
          {a("value")}
        </label>
      )}
      {action === "action.change.customer.status" && (
        <label>
          <input
            type="checkbox"
            checked={config.active ?? true}
            onChange={(e) => onChange({ ...config, active: e.target.checked })}
          />
          {a("customer")}
        </label>
      )}
    </div>
  );
}
