/** Graphical event → condition tree → action pipeline, including installed app actions. */
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import {
  useKnowledgeText,
  type KnowledgeWord,
} from "../../shared/i18n/knowledge-i18n";
import { useLegalText } from "../../shared/i18n/legal-i18n";
import FlowCanvas from "./FlowCanvas";
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import FlowInputs from "./FlowInputs";
import RuleBuilder, { type AutomationCatalog } from "./RuleBuilder";
export default function FlowBuilder({
  data,
  update,
  catalog,
}: {
  data: Record<string, any>;
  update: (key: string, value: any) => void;
  catalog: AutomationCatalog;
}) {
  const { mainLocale } = useContentLanguage();
  const { a } = useAutomationText();
  const k = useKnowledgeText();
  const { l } = useLegalText();
  const knowledgeEvents: Record<string, KnowledgeWord> = {
    "knowledge.document.ingested": "event_ingested",
    "knowledge.document.updated": "event_updated",
    "knowledge.document.visibility": "event_visibility",
    "knowledge.document.archived": "event_archived",
    "knowledge.document.restored": "event_restored",
    "intelligence.decision": "event_decision",
    "intelligence.claim.reviewed": "event_claimReviewed",
    "intelligence.experiment.changed": "event_experimentChanged",
    "intelligence.experiment.result": "event_experimentResult",
    "merchant.change.applied": "event_changeApplied",
  };
  const { x, locale } = useConnectedText();
  const app = catalog.apps.find((a) => a.id === data.appAction?.app);
  const events = [
    ...catalog.events,
    ...catalog.apps.flatMap((a) => [
      ...(a.manifest.permissions.includes("knowledge.write")
        ? [`app.${a.id}.source_imported`]
        : []),
      ...a.manifest.actions
        .filter((v: any) => v.handler === "emit")
        .map((v: any) => `app.${a.id}.${v.name}`),
    ]),
  ];
  const selectApp = (id: string) => {
    const a = catalog.apps.find((a) => a.id === id);
    const action = a?.manifest.actions.find((v: any) => v.flowAllowed);
    if (Object.values(data.instruction ?? {}).every((v) => !v)) {
      update("instruction", {
        [mainLocale]: "{event} · {orderNumber} · {totalPrice} EUR",
      });
    }
    update("appAction", { app: id, action: action?.name ?? "", arguments: {} });
  };
  return (
    <div className="flow-canvas">
      <section className="flow-stage">
        <span className="flow-step">01</span>
        <h3>{x("trigger")}</h3>
        <select
          aria-label={x("trigger")}
          value={data.event}
          onChange={(e) => update("event", e.target.value)}
        >
          {[...new Set([...events, data.event])].filter(Boolean).map((v) => (
            <option key={v} value={v}>
              {v.startsWith("app.")
                ? `${catalog.apps.find((a) => a.id === v.split(".")[1])?.manifest.name[locale.slice(0, 2)] ?? v.split(".")[1]} · ${v.endsWith(".source_imported") ? x("sourceImported") : v.split(".")[2]}`
                : v === "privacy.consent_changed"
                  ? l("consentChanged")
                  : v === "consumer.request.reviewed"
                    ? l("requestReviewed")
                    : v.startsWith("consumer.")
                      ? `${l("requestEvent")} · ${l(v.split(".")[1] as "withdrawal")}`
                      : knowledgeEvents[v]
                        ? k(knowledgeEvents[v])
                        : x(v)}
            </option>
          ))}
        </select>
      </section>
      <div className="flow-edge">↓</div>
      <RuleBuilder
        value={data.condition}
        catalog={catalog}
        onChange={(r) => update("condition", r)}
      />
      <div className="flow-edge">↓</div>
      <section className="flow-stage">
        <span className="flow-step">03</span>
        <h3>{x("then")}</h3>
        <select
          aria-label={x("then")}
          value={data.action}
          onChange={(e) => {
            update("action", e.target.value);
            if (e.target.value === "pipeline" && !data.pipeline)
              update("pipeline", {
                entry: "first",
                nodes: [
                  {
                    id: "first",
                    kind: "action",
                    action: "note",
                    config: { instruction: data.instruction ?? {} },
                    next: null,
                  },
                ],
              });
          }}
        >
          <option value="pipeline">{a("pipeline")}</option>
          <option value="note">{x("note")}</option>
          <option value="ai_proposal">{x("ai")}</option>
          <option value="app_action">{x("app")}</option>
        </select>
        {data.action === "pipeline" && (
          <FlowCanvas
            value={
              data.pipeline ?? {
                entry: "first",
                nodes: [
                  {
                    id: "first",
                    kind: "action",
                    action: "note",
                    config: { instruction: data.instruction ?? {} },
                    next: null,
                  },
                ],
              }
            }
            onChange={(p) => update("pipeline", p)}
            catalog={catalog}
          />
        )}
        {data.action === "app_action" && (
          <div className="connector-settings">
            <select
              aria-label={x("app")}
              value={data.appAction?.app ?? ""}
              onChange={(e) => selectApp(e.target.value)}
            >
              <option value="">—</option>
              {catalog.apps
                .filter((a) =>
                  a.manifest.actions.some((v: any) => v.flowAllowed),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.manifest.name[locale.slice(0, 2)] ?? a.id}
                  </option>
                ))}
            </select>
            <select
              aria-label={x("then")}
              value={data.appAction?.action ?? ""}
              onChange={(e) =>
                update("appAction", {
                  ...data.appAction,
                  action: e.target.value,
                })
              }
            >
              <option value="">—</option>
              {app?.manifest.actions
                .filter((v: any) => v.flowAllowed)
                .map((v: any) => (
                  <option key={v.name} value={v.name}>
                    {x(v.name)}
                  </option>
                ))}
            </select>
            <FlowInputs
              key={`${data.appAction?.app}:${data.appAction?.action}`}
              action={app?.manifest.actions.find(
                (v: any) => v.name === data.appAction?.action,
              )}
              value={data.appAction?.arguments ?? {}}
              onChange={(v) =>
                update("appAction", { ...data.appAction, arguments: v })
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
