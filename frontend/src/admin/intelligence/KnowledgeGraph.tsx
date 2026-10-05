/** KnowledgeGraph: focused studio-card graph-card view with explicit typed inputs and callbacks. */
import { useLocale } from "../../shared/i18n/i18n";

import Icon from "../../shared/ui/Icon";
export type KnowledgeGraphProps = {
  t: ReturnType<typeof useLocale>["t"];
  graph: import("../shell/studio-types").Graph;
  data: import("../shell/studio-types").Overview;
  needs: string[];
  focus: string;
  onProduct: (id: string) => void;
  label: (s: string) => string;
};
export default function KnowledgeGraph({
  t,
  graph,
  data,
  needs,
  focus,
  onProduct,
  label,
}: KnowledgeGraphProps) {
  return (
    <section className="studio-card graph-card">
      <div className="card-heading">
        <h2>{t("graph")}</h2>
        <span className="soft-tag">{graph.engine}</span>
      </div>
      <p className="muted">{t("graphHint")}</p>
      <svg
        className="knowledge-map"
        viewBox="0 0 560 470"
        role="group"
        aria-label={t("graph")}
      >
        {graph.needs.map((edge, i) => {
          const pi = data.products.findIndex((p) => p.id === edge.product_id),
            ni = needs.indexOf(edge.need);
          if (pi < 0) return null;
          return (
            <path
              key={i}
              d={`M178 ${40 + pi * 75} C280 ${40 + pi * 75} 275 ${38 + ni * 62} 389 ${38 + ni * 62}`}
              className={edge.product_id === focus ? "edge active" : "edge"}
            />
          );
        })}
        {data.products.map((product, i) => (
          <g
            key={product.id}
            role="button"
            tabIndex={0}
            aria-label={product.name}
            aria-pressed={focus === product.id}
            className={
              focus === product.id ? "graph-node selected" : "graph-node"
            }
            onClick={() => onProduct(product.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onProduct(product.id);
              }
            }}
          >
            <rect x="8" y={20 + i * 75} width="170" height="40" rx="9" />
            <circle cx="28" cy={40 + i * 75} r="4" />
            <text x="42" y={45 + i * 75}>
              {product.name.length > 20
                ? product.name.slice(0, 19) + "…"
                : product.name}
            </text>
          </g>
        ))}
        {needs.map((need, i) => (
          <g
            key={need}
            className={
              graph.needs.some((n) => n.product_id === focus && n.need === need)
                ? "need-node active"
                : "need-node"
            }
          >
            <rect x="389" y={18 + i * 62} width="165" height="40" rx="20" />
            <text x="471" y={43 + i * 62} textAnchor="middle">
              {label(need)}
            </text>
          </g>
        ))}
      </svg>
      <p className="provenance">
        <Icon name="lock" size={14} />
        {t("graphFact")}
      </p>
    </section>
  );
}
