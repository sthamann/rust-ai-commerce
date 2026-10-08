/** Pure control construction and bounded code-behind discovery keep visual edits and agent manifests identical. */
import type { Block, Entity, Statement } from "../../shared/apps/native/types";
export function accepts(kind: Block["kind"], f: Entity["fields"][number]) {
  if (kind === "textbox")
    return ["string", "integer", "decimal"].includes(f.kind);
  if (kind === "checkbox") return f.kind === "boolean";
  if (kind === "datepicker") return ["date", "datetime"].includes(f.kind);
  if (kind === "combobox") return !!f.choices?.length || !!f.references;
  if (kind === "image") return f.kind === "image";
  if (["kpi", "chart"].includes(kind))
    return ["integer", "decimal", "money"].includes(f.kind);
  return false;
}
export function calls(steps: Statement[]): string[] {
  return steps.flatMap((s) =>
    s.op === "call"
      ? [s.action]
      : s.op === "if"
        ? [...calls(s.then), ...calls(s.otherwise ?? [])]
        : [],
  );
}
export function renameCalls(
  steps: Statement[],
  rename: (s: string) => string,
): Statement[] {
  return steps.map((s) =>
    s.op === "call"
      ? { ...s, action: rename(s.action) }
      : s.op === "if"
        ? {
            ...s,
            then: renameCalls(s.then, rename),
            otherwise: renameCalls(s.otherwise ?? [], rename),
          }
        : s,
  );
}
