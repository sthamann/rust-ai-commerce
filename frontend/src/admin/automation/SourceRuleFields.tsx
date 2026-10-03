/** Original metadata drives typed condition inputs, including nested source scopes; unsupported runtimes stay visibly disabled. */
import CustomFieldCondition from "./CustomFieldCondition";
import type { ReactNode } from "react";
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import type { SourceDefinition } from "./source-rules";
export default function SourceRuleFields({
  definition,
  config,
  onChange,
  renderChild,
}: {
  definition: SourceDefinition;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
  renderChild: (
    node: Record<string, any>,
    update: (n: Record<string, any>) => void,
  ) => ReactNode;
}) {
  const { a } = useAutomationText();
  const set = (k: string, v: unknown) => onChange({ ...config, [k]: v });
  if (definition.type.endsWith("CustomField"))
    return <CustomFieldCondition config={config} onChange={onChange} />;
  return (
    <div className="source-rule-fields">
      <small>
        {a("source")} · {definition.source}
      </small>
      {definition.config?.operatorSet && (
        <label>
          {a("action")}
          <select
            value={config.operator ?? "="}
            onChange={(e) => set("operator", e.target.value)}
          >
            {definition.config.operatorSet.operators.map((op) => (
              <option key={op}>{op}</option>
            ))}
          </select>
        </label>
      )}
      {Object.values(definition.config?.fields ?? {})
        .filter(() => config.operator !== "empty")
        .map((field) => (
          <label key={a(field.name)}>
            {a(field.name)}
            {config.operator === "between" &&
            ["date", "datetime"].includes(field.type) ? (
              <div>
                {["from", "to"].map((k) => (
                  <label key={k}>
                    {a(k)}
                    <input
                      type={field.type === "date" ? "date" : "datetime-local"}
                      value={config[field.name]?.[k] ?? ""}
                      onChange={(e) =>
                        set(field.name, {
                          ...(typeof config[field.name] === "object"
                            ? config[field.name]
                            : {}),
                          [k]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ) : field.type === "bool" ? (
              <input
                type="checkbox"
                checked={config[field.name] ?? false}
                onChange={(e) => set(field.name, e.target.checked)}
              />
            ) : field.config.options && !field.type.includes("multi") ? (
              <select
                value={config[field.name] ?? ""}
                onChange={(e) =>
                  set(
                    field.name,
                    typeof field.config.options?.[0] === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              >
                {field.config.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : field.type.includes("multi") || field.type === "tagged" ? (
              <input
                value={(config[field.name] ?? []).join(", ")}
                onChange={(e) =>
                  set(
                    field.name,
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
            ) : (
              <input
                type={
                  ["int", "float"].includes(field.type)
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : field.type === "datetime"
                        ? "datetime-local"
                        : "text"
                }
                step={field.type === "int" ? 1 : "any"}
                value={config[field.name] ?? ""}
                onChange={(e) =>
                  set(
                    field.name,
                    ["int", "float"].includes(field.type)
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
          </label>
        ))}
      {["cartGoodsCount", "cartGoodsPrice", "cartLineItemGoodsTotal"].includes(
        definition.type,
      ) && (
        <label>
          <input
            type="checkbox"
            checked={!!config.filter}
            onChange={(e) =>
              set(
                "filter",
                e.target.checked
                  ? {
                      type: "andContainer",
                      config: {
                        children: [{ type: "alwaysValid", config: {} }],
                      },
                    }
                  : null,
              )
            }
          />
          {a("filter")}
        </label>
      )}
      {config.filter &&
        renderChild(config.filter, (next) => set("filter", next))}
      {config.children && (
        <div className="rule-children">
          {config.children.map((node: Record<string, any>, i: number) => (
            <div className="rule-branch" key={i}>
              {renderChild(node, (next) =>
                set(
                  "children",
                  config.children.map((n: Record<string, any>, j: number) =>
                    i === j ? next : n,
                  ),
                ),
              )}
              <button
                type="button"
                onClick={() =>
                  set(
                    "children",
                    config.children.filter((_: unknown, j: number) => i !== j),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          {definition.type !== "notContainer" && (
            <button
              type="button"
              onClick={() =>
                set("children", [
                  ...config.children,
                  { type: "alwaysValid", config: {} },
                ])
              }
            >
              + {a("addCondition")}
            </button>
          )}
        </div>
      )}
      {config.container &&
        renderChild(config.container, (next) => set("container", next))}
    </div>
  );
}
