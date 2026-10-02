/** Schema-derived flow parameters; runtime-bound event fields are intentionally supplied by the server. */
import { useState } from "react";
import { useConnectedText } from "./connected-i18n";
export default function FlowInputs({
  action,
  value,
  onChange,
}: {
  action: any;
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  const { x, locale } = useConnectedText();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const fields = Object.entries(action?.inputSchema?.properties ?? {}).filter(
    ([name]) => !["event", "requestKey", "kind", "template"].includes(name),
  );
  const set = (name: string, item: any) => {
    const next = { ...value };
    if (item === "" || item === undefined) delete next[name];
    else next[name] = item;
    onChange(next);
  };
  return (
    <div className="connector-settings">
      {fields.map(([name, p]: [string, any]) => (
        <label key={name}>
          {p["x-label"]?.[locale.slice(0, 2)] ??
            p.title ??
            x(name === "channel" ? "slackChannel" : name)}
          {p.type === "object" ? (
            <textarea
              value={raw[name] ?? JSON.stringify(value[name] ?? {}, null, 2)}
              onChange={(e) => {
                setRaw((r) => ({ ...r, [name]: e.target.value }));
                try {
                  const v = JSON.parse(e.target.value);
                  if (!v || typeof v !== "object" || Array.isArray(v))
                    throw Error("JSON");
                  e.target.setCustomValidity("");
                  set(name, v);
                } catch {
                  e.target.setCustomValidity("JSON");
                }
              }}
            />
          ) : p.type === "boolean" ? (
            <input
              type="checkbox"
              checked={value[name] ?? false}
              onChange={(e) => set(name, e.target.checked)}
            />
          ) : (
            <input
              required={action.inputSchema.required?.includes(name)}
              type={p.type === "integer" ? "number" : "text"}
              value={value[name] ?? ""}
              onChange={(e) =>
                set(
                  name,
                  p.type === "integer" && e.target.value !== ""
                    ? Number(e.target.value)
                    : e.target.value,
                )
              }
            />
          )}
        </label>
      ))}
    </div>
  );
}
