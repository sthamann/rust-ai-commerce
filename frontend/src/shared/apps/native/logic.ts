/** Bounded AST interpreter; no eval, globals, arbitrary URLs or implicit gateway permissions. */
import type { Expression, Statement } from "./types";
export type LogicHost = {
  value: (block: string, field?: string) => unknown;
  record: (block: string) => unknown;
  set: (block: string, value: unknown) => void;
  call: (action: string, input: unknown) => Promise<unknown>;
  accepted: (block: string, result: unknown) => void;
  message: (text: Record<string, string>) => void;
  navigate: (view: string) => void;
  refresh: (block: string) => void;
  validate: (block: string) => boolean;
  trace: (step: number, statement: Statement) => Promise<void>;
};
export async function execute(
  items: Statement[],
  host: LogicHost,
  signal?: AbortSignal,
) {
  let count = 0,
    paused = 0;
  const started = performance.now();
  const guard = (depth: number) => {
    if (
      ++count > 512 ||
      depth > 12 ||
      signal?.aborted ||
      performance.now() - started - paused > 30000
    )
      throw new Error("APP_LOGIC_LIMIT");
  };
  const value = (e: Expression, depth: number): unknown => {
    guard(depth);
    switch (e.kind) {
      case "literal":
        return structuredClone(e.value);
      case "value":
        return host.value(e.block, e.field);
      case "record":
        return host.record(e.block);
      case "object":
        return Object.fromEntries(
          Object.entries(e.fields).map(([k, e]) => [k, value(e, depth + 1)]),
        );
      default:
        throw new Error("APP_LOGIC_INVALID");
    }
  };
  const run = async (steps: Statement[], depth: number) => {
    for (const s of steps) {
      guard(depth);
      const beforeTrace = performance.now();
      await host.trace(count, s);
      paused += performance.now() - beforeTrace;
      if (signal?.aborted) throw new Error("APP_LOGIC_LIMIT");
      switch (s.op) {
        case "set":
          host.set(s.target, value(s.value, depth + 1));
          break;
        case "if": {
          const l = value(s.left, depth + 1),
            r = value(s.right, depth + 1);
          const comparable =
            (typeof l === "number" &&
              typeof r === "number" &&
              Number.isFinite(l) &&
              Number.isFinite(r)) ||
            (typeof l === "string" && typeof r === "string");
          if (!["eq", "ne"].includes(s.compare) && !comparable)
            throw new Error("APP_LOGIC_TYPE");
          const compare =
            s.compare === "eq"
              ? l === r
              : s.compare === "ne"
                ? l !== r
                : s.compare === "gt"
                  ? (l as number) > (r as number)
                  : s.compare === "ge"
                    ? (l as number) >= (r as number)
                    : s.compare === "lt"
                      ? (l as number) < (r as number)
                      : (l as number) <= (r as number);
          await run(compare ? s.then : (s.otherwise ?? []), depth + 1);
          break;
        }
        case "call": {
          const result = await host.call(s.action, value(s.input, depth + 1));
          if (s.input.kind === "record") host.accepted(s.input.block, result);
          break;
        }
        case "msgBox":
          host.message(s.text);
          break;
        case "navigate":
          host.navigate(s.view);
          break;
        case "refresh":
          host.refresh(s.target);
          break;
        case "validate":
          if (!host.validate(s.target)) throw new Error("APP_LOGIC_VALIDATION");
          break;
        default:
          throw new Error("APP_LOGIC_INVALID");
      }
    }
  };
  await run(items, 0);
}
