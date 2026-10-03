/** Stable graph data mirrors the Rust pipeline contract, with explicit true/false edges and persistent node identifiers. */
import type { Rule } from "./RuleBuilder";
export type FlowNode =
  | {
      id: string;
      kind: "condition";
      condition: Rule;
      on_true: string | null;
      on_false: string | null;
    }
  | {
      id: string;
      kind: "action";
      action: string;
      config: Record<string, any>;
      next: string | null;
    }
  | { id: string; kind: "delay"; seconds: number; next: string | null }
  | { id: string; kind: "stop" };
export type Pipeline = { entry: string; nodes: FlowNode[] };
export const newNode = (kind: FlowNode["kind"]): FlowNode => {
  const id = `step_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  return kind === "condition"
    ? {
        id,
        kind,
        condition: { type: "alwaysValid" },
        on_true: null,
        on_false: null,
      }
    : kind === "action"
      ? {
          id,
          kind,
          action: "note",
          config: { instruction: { en: "", de: "", fr: "", es: "" } },
          next: null,
        }
      : kind === "delay"
        ? { id, kind, seconds: 60, next: null }
        : { id, kind };
};
export function appendNode(p: Pipeline, kind: FlowNode["kind"]): Pipeline {
  const node = newNode(kind);
  const last = p.nodes.at(-1);
  const nodes = p.nodes.map((n) =>
    n === last && "next" in n && n.next === null
      ? { ...n, next: node.id }
      : n === last && n.kind === "condition" && !n.on_true
        ? { ...n, on_true: node.id }
        : n,
  );
  return { entry: p.entry || node.id, nodes: [...nodes, node] };
}
export function removeNode(p: Pipeline, id: string): Pipeline {
  return {
    entry:
      p.entry === id ? (p.nodes.find((n) => n.id !== id)?.id ?? "") : p.entry,
    nodes: p.nodes
      .filter((n) => n.id !== id)
      .map((n) =>
        n.kind === "condition"
          ? {
              ...n,
              on_true: n.on_true === id ? null : n.on_true,
              on_false: n.on_false === id ? null : n.on_false,
            }
          : "next" in n
            ? { ...n, next: n.next === id ? null : n.next }
            : n,
      ),
  };
}
