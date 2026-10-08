/** Small BASIC-style surface syntax compiles into the same bounded AST as visual and agent edits; no JavaScript execution. */
import type { Expression, Statement } from "../../shared/apps/native/types";
const id = "[a-z][a-z0-9_]{0,31}";
const identifier = (s: string) => new RegExp(`^${id}$`).test(s);
export function expression(source: string): Expression {
  const v = source.trim(),
    record = v.match(new RegExp(`^(${id})\\.Record$`, "i")),
    field = v.match(new RegExp(`^(${id})\\.Value(?:\\.(${id}))?$`, "i"));
  if (record) return { kind: "record", block: record[1] };
  if (field)
    return {
      kind: "value",
      block: field[1],
      ...(field[2] ? { field: field[2] } : {}),
    };
  return { kind: "literal", value: JSON.parse(v) };
}
export function expressionText(e: Expression): string {
  if (e.kind === "record") return `${e.block}.Record`;
  if (e.kind === "value")
    return `${e.block}.Value${e.field ? `.${e.field}` : ""}`;
  if (e.kind === "object")
    throw new Error("Structured expression: use the visual AST editor");
  return JSON.stringify(e.value);
}
export function parseBasic(source: string): Statement[] {
  if (source.length > 32768) throw new Error("Code exceeds 32 KiB");
  const lines = source
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("'"));
  let pos = 0,
    count = 0;
  const parse = (depth: number): Statement[] => {
    if (depth > 8) throw new Error("Code nesting exceeds eight");
    const steps: Statement[] = [];
    while (pos < lines.length) {
      const line = lines[pos];
      if (/^(Else|End If)$/i.test(line)) break;
      pos++;
      if (++count > 256) throw new Error("Code exceeds 256 instructions");
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^If (.+?) (>=|<=|<>|=|>|<) (.+) Then$/i))) {
        const then = parse(depth + 1);
        let otherwise: Statement[] = [];
        if (/^Else$/i.test(lines[pos] ?? "")) {
          pos++;
          otherwise = parse(depth + 1);
        }
        if (!/^End If$/i.test(lines[pos++] ?? ""))
          throw new Error(`Expected End If at line ${pos}`);
        steps.push({
          op: "if",
          left: expression(m[1]),
          compare: (
            {
              "=": "eq",
              "<>": "ne",
              ">": "gt",
              ">=": "ge",
              "<": "lt",
              "<=": "le",
            } as const
          )[m[2] as "="],
          right: expression(m[3]),
          then,
          otherwise,
        });
      } else if (
        (m = line.match(new RegExp(`^Set (${id})\\.Value = (.+)$`, "i")))
      )
        steps.push({ op: "set", target: m[1], value: expression(m[2]) });
      else if ((m = line.match(new RegExp(`^Call (${id})\\((.*)\\)$`, "i"))))
        steps.push({ op: "call", action: m[1], input: expression(m[2]) });
      else if ((m = line.match(/^MsgBox (.+)$/i))) {
        const text = JSON.parse(m[1]);
        if (
          !text ||
          typeof text !== "object" ||
          Array.isArray(text) ||
          Object.values(text).some((v) => typeof v !== "string")
        )
          throw new Error("MsgBox requires localized text");
        steps.push({ op: "msgBox", text });
      } else if ((m = line.match(new RegExp(`^Navigate (${id})$`, "i"))))
        steps.push({ op: "navigate", view: m[1] });
      else if ((m = line.match(new RegExp(`^(${id})\\.Refresh$`, "i"))))
        steps.push({ op: "refresh", target: m[1] });
      else if ((m = line.match(new RegExp(`^Validate (${id})$`, "i"))))
        steps.push({ op: "validate", target: m[1] });
      else throw new Error(`Unknown instruction at line ${pos}`);
    }
    return steps;
  };
  const steps = parse(0);
  if (pos !== lines.length) throw new Error("Unexpected block terminator");
  return steps;
}
export function printBasic(items: Statement[], depth = 0): string {
  if (depth > 8) throw new Error("Code nesting exceeds eight");
  const indent = "  ".repeat(depth);
  return items
    .map((s) => {
      let line: string;
      switch (s.op) {
        case "set":
          line = `Set ${s.target}.Value = ${expressionText(s.value)}`;
          break;
        case "call":
          line = `Call ${s.action}(${expressionText(s.input)})`;
          break;
        case "msgBox":
          line = `MsgBox ${JSON.stringify(s.text)}`;
          break;
        case "refresh":
          line = `${s.target}.Refresh`;
          break;
        case "validate":
          line = `Validate ${s.target}`;
          break;
        case "navigate":
          line = `Navigate ${s.view}`;
          break;
        case "if":
          return `${indent}If ${expressionText(s.left)} ${{ eq: "=", ne: "<>", gt: ">", ge: ">=", lt: "<", le: "<=" }[s.compare]} ${expressionText(s.right)} Then\n${printBasic(s.then, depth + 1)}${s.otherwise?.length ? `\n${indent}Else\n${printBasic(s.otherwise, depth + 1)}` : ""}\n${indent}End If`;
      }
      return indent + line;
    })
    .join("\n");
}
export function validateAst(value: unknown): Statement[] {
  if (!Array.isArray(value) || value.length > 256)
    throw new Error("Instruction array required");
  const visit = (steps: unknown[], depth = 0) => {
    if (depth > 8) throw new Error("Code nesting exceeds eight");
    for (const v of steps) {
      const s = v as Statement;
      if (
        !s ||
        ![
          "set",
          "if",
          "call",
          "msgBox",
          "navigate",
          "refresh",
          "validate",
        ].includes(s.op)
      )
        throw new Error("Unknown instruction");
      if (s.op === "if") {
        if (!Array.isArray(s.then)) throw new Error("Then required");
        visit(s.then, depth + 1);
        visit(s.otherwise ?? [], depth + 1);
      }
      if (s.op === "call" && !identifier(s.action))
        throw new Error("Invalid action");
    }
  };
  visit(value);
  return value as Statement[];
}
