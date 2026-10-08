/** Expressions use typed source text and known form/control references, with a separate JSON editor for agent object ASTs. */
import { useEffect, useId, useState } from "react";
import type { Expression, NativeView } from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useAppCodeBuffer } from "./AppCodeBuffer";
import { expression, expressionText } from "./basic-code";
export default function AppExpressionEditor({
  value,
  view,
  onChange,
}: {
  value: Expression;
  view: NativeView;
  onChange: (v: Expression) => void;
}) {
  const { a } = useAppStudioText(),
    id = useId(),
    report = useAppCodeBuffer();
  const format = (e: Expression) =>
    e.kind === "object" ? JSON.stringify(e) : expressionText(e);
  const [source, setSource] = useState(format(value)),
    [error, setError] = useState(false);
  useEffect(() => {
    report(id, error);
    return () => report(id, false);
  }, [id, error, report]);

  useEffect(() => {
    setSource(format(value));
    setError(false);
  }, [value]);
  const change = (s: string) => {
    setSource(s);
    try {
      const parsed = s.trim().startsWith("{") ? JSON.parse(s) : undefined;
      const next = parsed?.kind === "object" ? parsed : expression(s);
      onChange(next);
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <label>
      {a("expression")}
      <input
        value={source}
        maxLength={8192}
        onChange={(e) => change(e.target.value)}
        aria-invalid={error}
      />
      {error && <small role="alert">{a("codeInvalid")}</small>}
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) change(e.target.value);
        }}
      >
        <option value="">—</option>
        {view.blocks
          .filter(
            (b) =>
              b.kind === "form" ||
              ["textbox", "combobox", "checkbox", "datepicker"].includes(
                b.kind,
              ),
          )
          .map((b) => (
            <option
              key={b.id}
              value={`${b.id}.${b.kind === "form" ? "Record" : "Value"}`}
            >
              {b.id} ·{" "}
              {a(b.kind === "form" ? "recordExpression" : "valueExpression")}
            </option>
          ))}
      </select>
    </label>
  );
}
