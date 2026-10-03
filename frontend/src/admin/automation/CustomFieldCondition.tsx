/** Typed custom field conditions support text, numeric, Boolean and date values using original field payload names. */
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import JsonField from "./JsonField";
export default function CustomFieldCondition({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const { a } = useAutomationText();
  const field = config.renderedField ?? { name: "", type: "text" };
  const set = (key: string, value: unknown) =>
    onChange({ ...config, [key]: value });
  const kind = field.type;
  return (
    <div className="flow-action-fields">
      <label>
        {a("field")}
        <input
          value={field.name ?? ""}
          onChange={(e) =>
            set("renderedField", { ...field, name: e.target.value })
          }
        />
      </label>
      <label>
        {a("type")}
        <select
          value={kind}
          onChange={(e) =>
            onChange({
              ...config,
              renderedField: { ...field, type: e.target.value },
              renderedFieldValue:
                e.target.value === "bool"
                  ? false
                  : e.target.value === "int" || e.target.value === "float"
                    ? 0
                    : "",
            })
          }
        >
          {["text", "int", "float", "bool", "date", "datetime", "select"].map(
            (k) => (
              <option key={k} value={k}>
                {a(k)}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        {a("operator")}
        <select
          value={config.operator ?? "="}
          onChange={(e) => set("operator", e.target.value)}
        >
          {[
            "=",
            "!=",
            ...(kind === "bool" || kind === "select"
              ? []
              : [">", ">=", "<", "<="]),
            ...(kind === "date" || kind === "datetime" ? ["between"] : []),
          ].map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
      </label>
      {kind === "select" ? (
        <JsonField
          label={a("value")}
          value={config.renderedFieldValue}
          onChange={(v) => set("renderedFieldValue", v)}
        />
      ) : config.operator === "between" ? (
        <>
          {["from", "to"].map((k) => (
            <label key={k}>
              {a(k)}
              <input
                type={kind === "date" ? "date" : "datetime-local"}
                value={config.renderedFieldValue?.[k] ?? ""}
                onChange={(e) =>
                  set("renderedFieldValue", {
                    ...(typeof config.renderedFieldValue === "object"
                      ? config.renderedFieldValue
                      : {}),
                    [k]: e.target.value,
                  })
                }
              />
            </label>
          ))}
        </>
      ) : (
        <label>
          {a("value")}
          <input
            type={
              kind === "bool"
                ? "checkbox"
                : kind === "int" || kind === "float"
                  ? "number"
                  : kind === "date"
                    ? "date"
                    : kind === "datetime"
                      ? "datetime-local"
                      : "text"
            }
            checked={
              kind === "bool" ? config.renderedFieldValue === true : undefined
            }
            value={
              kind === "bool" ? undefined : (config.renderedFieldValue ?? "")
            }
            step={kind === "int" ? 1 : "any"}
            onChange={(e) =>
              set(
                "renderedFieldValue",
                kind === "bool"
                  ? e.target.checked
                  : kind === "int" || kind === "float"
                    ? Number(e.target.value)
                    : e.target.value,
              )
            }
          />
        </label>
      )}
    </div>
  );
}
