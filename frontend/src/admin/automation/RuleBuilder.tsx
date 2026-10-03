/** Visual recursive rule tree: AND/OR/NOT groups, typed facts and editable leaf conditions. */
import SourceRuleFields from "./SourceRuleFields";
import {
  fromSource,
  toSource,
  sourceRule,
  type SourceDefinition,
} from "./source-rules";
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import { useState } from "react";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
export type Rule = Record<string, any>;
export type AutomationCatalog = {
  rules?: { id: string; name: Record<string, string>; revision: number }[];
  sourceConditions?: SourceDefinition[];
  actions?: string[];
  conditions: string[];
  fields: string[];
  events: string[];
  apps: { id: string; manifest: any }[];
};
export const newRule = (type: string): Rule =>
  type === "ruleReference"
    ? { type, ruleId: "" }
    : type === "andContainer" || type === "orContainer"
      ? { type, children: [{ type: "alwaysValid" }] }
      : type === "notContainer"
        ? { type, child: { type: "alwaysValid" } }
        : type === "cartCartAmount"
          ? { type, operator: ">=", amount: 100 }
          : type === "cartLineItemCount"
            ? { type, operator: ">=", count: 1 }
            : type === "customerLoggedIn"
              ? { type, isLoggedIn: true }
              : type === "contextField"
                ? { type, field: "customer.email", operator: "=", value: "" }
                : type === "eventField"
                  ? {
                      type,
                      path: "sourceKind",
                      operator: "=",
                      value: "support_email",
                    }
                  : ["alwaysValid"].includes(type)
                    ? { type }
                    : { type, values: [], operator: "=" };
export default function RuleBuilder({
  value,
  onChange,
  catalog,
  depth = 0,
}: {
  value: Rule;
  onChange: (r: Rule) => void;
  catalog: AutomationCatalog;
  depth?: number;
}) {
  const { x } = useConnectedText();
  const { a, locale } = useAutomationText();
  const source = catalog.sourceConditions?.find((d) => d.type === value.name);
  const [input, setInput] = useState("");
  const group = ["andContainer", "orContainer"].includes(value.type);
  const not = value.type === "notContainer";
  const numeric = ["cartCartAmount", "cartLineItemCount"].includes(value.type);
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className={`rule-node ${group || not ? "rule-group" : "rule-leaf"}`}>
      <div className="rule-node-head">
        <span className="rule-node-dot" />
        <select
          aria-label={x("field")}
          value={source ? `source:${source.type}` : value.type}
          onChange={(e) => {
            const def = catalog.sourceConditions?.find(
              (d) => `source:${a(d.type)}` === e.target.value,
            );
            onChange(def ? sourceRule(def) : newRule(e.target.value));
          }}
        >
          {catalog.conditions.map((type) => (
            <option value={type} key={type}>
              {type === "ruleReference" ? a(type) : x(type)}
            </option>
          ))}
          <optgroup label={a("original")}>
            {catalog.sourceConditions?.map((d) => (
              <option
                key={a(d.type)}
                value={`source:${a(d.type)}`}
                disabled={!d.supported}
              >
                {a(d.type)}
                {!d.supported ? ` · ${a("missing")}` : ""}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="rule-depth">{depth + 1}</span>
      </div>
      {value.type === "ruleReference" && (
        <label>
          {a("ruleReference")}
          <select
            value={value.ruleId ?? ""}
            onChange={(e) => set("ruleId", e.target.value)}
          >
            <option value="">—</option>
            {catalog.rules?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name[locale.slice(0, 2)] ?? r.id}
              </option>
            ))}
          </select>
        </label>
      )}
      {source ? (
        <SourceRuleFields
          definition={source}
          config={value.config}
          onChange={(config) => set("config", config)}
          renderChild={(node, update) => (
            <RuleBuilder
              value={fromSource(node)}
              onChange={(next) => update(toSource(next))}
              catalog={catalog}
              depth={depth + 1}
            />
          )}
        />
      ) : group ? (
        <>
          <div className="rule-children">
            {value.children.map((r: Rule, i: number) => (
              <div className="rule-branch" key={i}>
                <RuleBuilder
                  value={r}
                  catalog={catalog}
                  depth={depth + 1}
                  onChange={(next) =>
                    set(
                      "children",
                      value.children.map((v: Rule, j: number) =>
                        j === i ? next : v,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="rule-remove"
                  aria-label={x("remove")}
                  onClick={() =>
                    set(
                      "children",
                      value.children.filter((_: Rule, j: number) => j !== i),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="studio-secondary"
            disabled={depth >= 8 || value.children.length >= 20}
            onClick={() =>
              set("children", [...value.children, { type: "alwaysValid" }])
            }
          >
            + {x("add")}
          </button>
        </>
      ) : not ? (
        <div className="rule-children">
          <RuleBuilder
            value={value.child}
            onChange={(r) => set("child", r)}
            catalog={catalog}
            depth={depth + 1}
          />
        </div>
      ) : (
        <div className="rule-values">
          {value.type === "customerEmail" ? (
            <>
              <select
                aria-label={x("operator")}
                value={value.operator}
                onChange={(e) => set("operator", e.target.value)}
              >
                <option>=</option>
                <option>!=</option>
              </select>
              <input
                aria-label={x("value")}
                value={value.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </>
          ) : numeric ? (
            <>
              <select
                aria-label={x("operator")}
                value={value.operator}
                onChange={(e) => set("operator", e.target.value)}
              >
                {["=", "!=", ">", ">=", "<", "<="].map((op) => (
                  <option key={op}>{op}</option>
                ))}
              </select>
              <input
                aria-label={x("value")}
                type="number"
                min={0}
                step=".01"
                value={value.amount ?? value.count}
                onChange={(e) =>
                  set(
                    value.type === "cartCartAmount" ? "amount" : "count",
                    Number(e.target.value),
                  )
                }
              />
            </>
          ) : value.type === "customerLoggedIn" ? (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={value.isLoggedIn ?? true}
                onChange={(e) => set("isLoggedIn", e.target.checked)}
              />
              {x("customerLoggedIn")}
            </label>
          ) : ["contextField", "eventField"].includes(value.type) ? (
            <>
              {value.type === "contextField" ? (
                <select
                  aria-label={x("field")}
                  value={value.field}
                  onChange={(e) => set("field", e.target.value)}
                >
                  {catalog.fields.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={x("field")}
                  value={value.path}
                  onChange={(e) => set("path", e.target.value)}
                />
              )}
              <select
                aria-label={x("operator")}
                value={value.operator}
                onChange={(e) => set("operator", e.target.value)}
              >
                {["=", "!=", "empty", "contains", ">", ">=", "<", "<="].map(
                  (op) => (
                    <option key={op}>{op}</option>
                  ),
                )}
              </select>
              <input
                aria-label={x("value")}
                value={String(value.value ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  set(
                    "value",
                    v === "true"
                      ? true
                      : v === "false"
                        ? false
                        : value.field === "cart.quantity"
                          ? Number(v)
                          : v,
                  );
                }}
              />
            </>
          ) : value.values ? (
            <>
              <select
                aria-label={x("operator")}
                value={value.operator ?? "="}
                onChange={(e) => set("operator", e.target.value)}
              >
                {["=", "!=", "empty"].map((op) => (
                  <option key={op}>{op}</option>
                ))}
              </select>
              <div className="rule-tokens">
                {value.values.map((v: string) => (
                  <button
                    type="button"
                    key={v}
                    title={x("remove")}
                    onClick={() =>
                      set(
                        "values",
                        value.values.filter((s: string) => s !== v),
                      )
                    }
                  >
                    {v} ×
                  </button>
                ))}
              </div>
              <input
                aria-label={x("value")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (input.trim() && !value.values.includes(input.trim()))
                      set("values", [...value.values, input.trim()]);
                    setInput("");
                  }
                }}
              />
              <button
                type="button"
                className="studio-secondary"
                disabled={!input.trim()}
                onClick={() => {
                  set("values", [...value.values, input.trim()]);
                  setInput("");
                }}
              >
                +
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
