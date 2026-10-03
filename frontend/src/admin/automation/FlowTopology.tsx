/** Readable connected overview of the persisted graph; selecting a node opens its matching editor card. */
import type { Pipeline } from "./pipeline-types";
import { useAutomationText } from "../../shared/i18n/automation-i18n";
export default function FlowTopology({ value }: { value: Pipeline }) {
  const { a } = useAutomationText();
  const positions = new Map(
    value.nodes.map((n, i) => [
      n.id,
      { x: 25 + (i % 3) * 230, y: 25 + Math.floor(i / 3) * 110 },
    ]),
  );
  const height = Math.max(120, Math.ceil(value.nodes.length / 3) * 110 + 20);
  return (
    <div className="flow-topology">
      <svg viewBox={`0 0 720 ${height}`} aria-label={a("pipeline")} role="img">
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {value.nodes.flatMap((n) => {
          const from = positions.get(n.id)!;
          const edges =
            n.kind === "condition"
              ? [
                  [n.on_true, a("yes")],
                  [n.on_false, a("no")],
                ]
              : "next" in n
                ? [[n.next, ""]]
                : [];
          return edges
            .filter(([target]) => target && positions.has(target))
            .map(([target, label]) => {
              const to = positions.get(target!)!;
              const branchY = label === a("no") ? 55 : label ? 25 : 35;
              return (
                <g
                  key={`${n.id}-${target}-${label}`}
                  className={label === a("no") ? "edge-no" : "edge-yes"}
                >
                  <path
                    d={`M ${from.x + 180} ${from.y + branchY} C ${from.x + 210} ${from.y + branchY}, ${to.x - 30} ${to.y + 35}, ${to.x} ${to.y + 35}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    markerEnd="url(#flow-arrow)"
                  />
                  <text x={from.x + 190} y={from.y + branchY - 6}>
                    {label}
                  </text>
                </g>
              );
            });
        })}
        {value.nodes.map((n, i) => {
          const pos = positions.get(n.id)!;
          const label =
            n.kind === "action"
              ? a(n.action)
              : a(
                  n.kind === "delay"
                    ? "delay"
                    : n.kind === "stop"
                      ? "stop"
                      : "condition",
                );
          const focus = () =>
            document
              .getElementById(`flow-node-${n.id}`)
              ?.scrollIntoView({ block: "center", behavior: "smooth" });
          return (
            <g
              key={n.id}
              transform={`translate(${pos.x} ${pos.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${i + 1} ${label}`}
              onClick={focus}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  focus();
                }
              }}
            >
              <rect
                width="180"
                height="70"
                rx="12"
                className={value.entry === n.id ? "flow-start" : ""}
              />
              <text x="12" y="25">
                {String(i + 1).padStart(2, "0")} ·{" "}
                {n.kind === "condition"
                  ? "◇"
                  : n.kind === "delay"
                    ? "◷"
                    : n.kind === "stop"
                      ? "■"
                      : "↗"}
              </text>
              <text x="12" y="48">
                <title>{label}</title>
                {label.length > 24 ? label.slice(0, 22) + "…" : label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
