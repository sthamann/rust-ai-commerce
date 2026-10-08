/** Block instructions expose schema-aware targets; nested branches are edited recursively under the server's bounded AST contract. */
import type {
  Manifest,
  NativeView,
  Statement,
  Expression,
} from "../../shared/apps/native/types";
import { appText, useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import LocalizedField from "../../shared/i18n/LocalizedField";
import AppExpressionEditor from "./AppExpressionEditor";
import { textMap } from "./app-model";
export default function AppInstructionEditor({
  steps,
  manifest,
  view,
  onChange,
  depth = 0,
}: {
  steps: Statement[];
  manifest: Manifest;
  view: NativeView;
  onChange: (s: Statement[]) => void;
  depth?: number;
}) {
  const { a } = useAppStudioText();
  const forms = view.blocks.filter((b) => b.kind === "form"),
    inputs = view.blocks.filter((b) =>
      ["textbox", "combobox", "checkbox", "datepicker"].includes(b.kind),
    ),
    reads = view.blocks.filter((b) => b.readAction),
    nav = manifest.views ?? [];
  const defaults: Statement[] = [
    { op: "msgBox", text: appText("example") },
    ...(forms.length
      ? [{ op: "validate", target: forms[0].id } as Statement]
      : []),
    ...(reads.length
      ? [{ op: "refresh", target: reads[0].id } as Statement]
      : []),
    ...(nav.length ? [{ op: "navigate", view: nav[0].id } as Statement] : []),
    ...(manifest.actions?.length
      ? [
          {
            op: "call",
            action: manifest.actions[0].name,
            input: { kind: "literal", value: {} },
          } as Statement,
        ]
      : []),
    ...(inputs.length
      ? [
          {
            op: "set",
            target: inputs[0].id,
            value: { kind: "literal", value: "" },
          } as Statement,
        ]
      : []),
    ...(depth < 7
      ? [
          {
            op: "if",
            left: { kind: "literal", value: 1 },
            compare: "eq",
            right: { kind: "literal", value: 1 },
            then: [],
            otherwise: [],
          } as Statement,
        ]
      : []),
  ];
  const patch = (i: number, s: Statement) =>
    onChange(steps.map((old, n) => (n === i ? s : old)));
  const select = (v: string, options: string[], set: (v: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)}>
      {options.map((o) => (
        <option value={o} key={o}>
          {o}
        </option>
      ))}
    </select>
  );
  const expr = (value: Expression, set: (v: Expression) => void) => (
    <AppExpressionEditor value={value} view={view} onChange={set} />
  );
  return (
    <div className="app-instructions">
      {steps.map((s, i) => (
        <section className="app-instruction" key={i}>
          <header>
            <code>
              {i + 1} · {s.op}
            </code>
            <button
              type="button"
              aria-label={a("delete")}
              onClick={() => onChange(steps.filter((_, n) => n !== i))}
            >
              ×
            </button>
            <button
              type="button"
              disabled={!i}
              aria-label={a("up")}
              onClick={() => {
                const next = [...steps];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              ↑
            </button>
          </header>
          {s.op === "msgBox" && (
            <LocalizedField
              label={a("messageExpression")}
              value={s.text}
              onChange={(v) => patch(i, { ...s, text: textMap(v) })}
              multiline
              maxLength={1000}
            />
          )}
          {s.op === "validate" &&
            select(
              s.target,
              forms.map((b) => b.id),
              (target) => patch(i, { ...s, target }),
            )}
          {s.op === "refresh" &&
            select(
              s.target,
              reads.map((b) => b.id),
              (target) => patch(i, { ...s, target }),
            )}
          {s.op === "navigate" &&
            select(
              s.view,
              nav.map((b) => b.id),
              (v) => patch(i, { ...s, view: v }),
            )}
          {s.op === "set" && (
            <>
              {select(
                s.target,
                inputs.map((b) => b.id),
                (target) => patch(i, { ...s, target }),
              )}
              {expr(s.value, (value) => patch(i, { ...s, value }))}
            </>
          )}
          {s.op === "call" && (
            <>
              {select(
                s.action,
                manifest.actions?.map((a) => a.name) ?? [],
                (action) => patch(i, { ...s, action }),
              )}
              {expr(s.input, (input) => patch(i, { ...s, input }))}
            </>
          )}
          {s.op === "if" && (
            <>
              {expr(s.left, (left) => patch(i, { ...s, left }))}
              {select(
                s.compare,
                ["eq", "ne", "gt", "ge", "lt", "le"],
                (compare) =>
                  patch(i, { ...s, compare: compare as typeof s.compare }),
              )}
              {expr(s.right, (right) => patch(i, { ...s, right }))}
              <strong>{a("thenBranch")}</strong>
              <AppInstructionEditor
                steps={s.then}
                manifest={manifest}
                view={view}
                depth={depth + 1}
                onChange={(then) => patch(i, { ...s, then })}
              />
              <strong>{a("elseBranch")}</strong>
              <AppInstructionEditor
                steps={s.otherwise ?? []}
                manifest={manifest}
                view={view}
                depth={depth + 1}
                onChange={(otherwise) => patch(i, { ...s, otherwise })}
              />
            </>
          )}
        </section>
      ))}
      <select
        aria-label={a("addInstruction")}
        value=""
        disabled={steps.length >= 64}
        onChange={(e) => {
          const s = defaults.find((s) => s.op === e.target.value);
          if (s) onChange([...steps, structuredClone(s)]);
        }}
      >
        <option value="">+ {a("addInstruction")}</option>
        {defaults.map((s) => (
          <option key={s.op} value={s.op}>
            {s.op}
          </option>
        ))}
      </select>
    </div>
  );
}
