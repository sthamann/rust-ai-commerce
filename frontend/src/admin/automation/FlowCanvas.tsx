/** Branching flow canvas edits the actual server graph, including true/false edges, reusable actions and durable delays. */
import FlowTopology from "./FlowTopology";
import RuleBuilder, { type AutomationCatalog } from "./RuleBuilder";
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import FlowActionFields from "./FlowActionFields";
import {
  appendNode,
  removeNode,
  type FlowNode,
  type Pipeline,
} from "./pipeline-types";
export default function FlowCanvas({
  value,
  onChange,
  catalog,
}: {
  value: Pipeline;
  onChange: (p: Pipeline) => void;
  catalog: AutomationCatalog;
}) {
  const { a } = useAutomationText();
  const update = (id: string, next: FlowNode) =>
    onChange({
      ...value,
      nodes: value.nodes.map((n) => (n.id === id ? next : n)),
    });
  const edge = (
    node: FlowNode,
    key: "next" | "on_true" | "on_false",
    label: string,
  ) => (
    <label className="flow-connection">
      {label}
      <select
        value={(node as any)[key] ?? ""}
        onChange={(e) =>
          update(node.id, {
            ...node,
            [key]: e.target.value || null,
          } as FlowNode)
        }
      >
        <option value="">{a("end")}</option>
        {value.nodes
          .filter((n) => n.id !== node.id)
          .map((n) => (
            <option key={n.id} value={n.id}>
              {value.nodes.indexOf(n) + 1} ·{" "}
              {n.kind === "action"
                ? a(n.action)
                : a(
                    n.kind === "condition"
                      ? "condition"
                      : n.kind === "delay"
                        ? "delay"
                        : "stop",
                  )}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <section className="automation-canvas" aria-label={a("pipeline")}>
      <header>
        <h3>{a("pipeline")}</h3>
        <span>
          {value.nodes.length}/100 {a("nodes")}
        </span>
      </header>
      <FlowTopology value={value} />
      <div className="automation-canvas-grid">
        {value.nodes.map((node, index) => (
          <article
            id={`flow-node-${node.id}`}
            className={`automation-node node-${node.kind}`}
            key={node.id}
          >
            <header>
              <strong>
                {String(index + 1).padStart(2, "0")} ·{" "}
                {a(
                  node.kind === "condition"
                    ? "condition"
                    : node.kind === "delay"
                      ? "delay"
                      : node.kind === "stop"
                        ? "stop"
                        : "action",
                )}
              </strong>
              <button
                type="button"
                aria-label={`${a("removeStep")} ${index + 1}`}
                onClick={() => onChange(removeNode(value, node.id))}
              >
                ×
              </button>
            </header>
            <label className="flow-entry">
              <input
                type="radio"
                name="flow-entry"
                checked={value.entry === node.id}
                onChange={() => onChange({ ...value, entry: node.id })}
              />
              {a("entry")}
            </label>
            {node.kind === "condition" && (
              <>
                <RuleBuilder
                  value={node.condition}
                  catalog={catalog}
                  onChange={(condition) =>
                    update(node.id, { ...node, condition })
                  }
                />
                <div className="flow-branches">
                  {edge(node, "on_true", `✓ ${a("yes")}`)}
                  {edge(node, "on_false", `× ${a("no")}`)}
                </div>
              </>
            )}
            {node.kind === "action" && (
              <>
                <select
                  aria-label={a("action")}
                  value={node.action}
                  onChange={(e) =>
                    update(node.id, {
                      ...node,
                      action: e.target.value,
                      config:
                        e.target.value === "app_action"
                          ? { arguments: {} }
                          : e.target.value === "action.mail.send"
                            ? { templateId: "order_confirmation" }
                            : {},
                    })
                  }
                >
                  {(
                    catalog.actions ?? ["note", "ai_proposal", "app_action"]
                  ).map((action) => (
                    <option key={action} value={action}>
                      {a(action)}
                    </option>
                  ))}
                </select>
                <FlowActionFields
                  key={`${node.id}:${node.action}`}
                  action={node.action}
                  catalog={catalog}
                  config={node.config}
                  onChange={(config) => update(node.id, { ...node, config })}
                />
                {edge(node, "next", a("next"))}
              </>
            )}
            {node.kind === "delay" && (
              <>
                <label>
                  {a("seconds")}
                  <input
                    type="number"
                    min={0}
                    max={2592000}
                    value={node.seconds}
                    onChange={(e) =>
                      update(node.id, {
                        ...node,
                        seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
                {edge(node, "next", a("next"))}
              </>
            )}
          </article>
        ))}
      </div>
      <footer>
        {(["condition", "action", "delay", "stop"] as const).map((kind) => (
          <button
            type="button"
            key={kind}
            disabled={value.nodes.length >= 100}
            onClick={() => onChange(appendNode(value, kind))}
          >
            +{" "}
            {a(
              kind === "condition"
                ? "addCondition"
                : kind === "action"
                  ? "addAction"
                  : kind === "delay"
                    ? "addDelay"
                    : "stop",
            )}
          </button>
        ))}
      </footer>
    </section>
  );
}
