/** KnowledgeView renders verified shop state and typed user actions. */
import { useWorkbenchText } from "./workbench-i18n";
import { useState } from "react";
import DocumentsManager from "./DocumentsManager";
import MemoryView from "./MemoryView";
import Icon from "./Icon";
import ProductArt from "./ProductArt";
import { useLocale } from "./i18n";
import type { Overview, Product, RequestFn } from "./studio-types";
const needLabels: Record<string, string[]> = {
  reading: ["Lesen", "Reading", "Lecture", "Lectura"],
  work: ["Arbeiten", "Work", "Travail", "Trabajo"],
  "small-space": [
    "Kleine Räume",
    "Small spaces",
    "Petits espaces",
    "Espacios pequeños",
  ],
  "warm-light": ["Warmes Licht", "Warm light", "Lumière chaude", "Luz cálida"],
  coffee: ["Kaffee", "Coffee", "Café", "Café"],
  notes: ["Notizen", "Notes", "Notes", "Notas"],
  storage: ["Aufbewahrung", "Storage", "Rangement", "Almacenamiento"],
};
export function KnowledgeView({
  focus,
  data,
  request,
  onIntent,
  onProduct,
}: {
  focus: string;
  data: Overview;
  request: RequestFn;
  onIntent: (s: string) => void;
  onProduct: (id: string) => void;
}) {
  const { w } = useWorkbenchText();
  const { t, locale, money, number } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] =
    useState<{ id: string; name: string; price: number }[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const graph = data.knowledge.graph;
  const needs = [...new Set(graph.needs.map((n) => n.need))].sort();
  const p = data.products.find((p) => p.id === focus);
  const li = Object.keys({
    "de-DE": 0,
    "en-GB": 1,
    "fr-FR": 2,
    "es-ES": 3,
  }).indexOf(locale);
  const label = (s: string) => needLabels[s]?.[li] || s;
  const pairs = graph.pairs
    .filter((e) => e.left === focus || e.right === focus)
    .map((e) =>
      data.products.find((p) => p.id === (e.left === focus ? e.right : e.left)),
    )
    .filter((p): p is Product => !!p);
  return (
    <div className="studio-page">
      <div className="page-intro">
        <span className="kicker">{t("knowledge")}</span>
        <h1>{t("intelligenceTitle")}</h1>
        <p>{t("intelligenceSub")}</p>
      </div>
      <div className="knowledge-stats">
        <span>
          <strong>{graph.needs.length + graph.pairs.length}</strong>
          {t("curated")}
        </span>
        <span>
          <strong>{data.knowledge.indexedProducts}</strong>
          {t("embeddings")}
        </span>
        <span>
          <strong>{data.summary.appliedPlans}</strong>
          {t("memory")}
        </span>
      </div>
      <MemoryView request={request} />
      <DocumentsManager request={request} />
      {!!graph.documents?.length && (
        <section className="studio-card">
          <h2>{w("documentRelations")}</h2>
          {graph.documents.map((d) => (
            <p key={d.document_id}>
              <button
                className="studio-text-button"
                onClick={() => onProduct(d.product_id)}
              >
                {data.products.find((p) => p.id === d.product_id)?.name ??
                  d.product_id}
              </button>{" "}
              → {d.title}
            </p>
          ))}
        </section>
      )}
      <div className="knowledge-layout">
        <section className="studio-card graph-card">
          <div className="card-heading">
            <h2>{t("graph")}</h2>
            <span className="soft-tag">Apache AGE</span>
          </div>
          <p className="muted">{t("graphHint")}</p>
          <svg
            className="knowledge-map"
            viewBox="0 0 560 470"
            role="group"
            aria-label={t("graph")}
          >
            {graph.needs.map((edge, i) => {
              const pi = data.products.findIndex(
                  (p) => p.id === edge.product_id,
                ),
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
                  graph.needs.some(
                    (n) => n.product_id === focus && n.need === need,
                  )
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
        <section className="studio-card product-context">
          <span className="kicker">{t("productKnowledge")}</span>
          {p ? (
            <>
              <div className="context-product-art">
                <ProductArt id={p.id} />
              </div>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <h3>{t("needs")}</h3>
              <div className="tag-list">
                {graph.needs
                  .filter((n) => n.product_id === focus)
                  .map((n) => (
                    <span key={n.need}>{label(n.need)}</span>
                  ))}
              </div>
              <h3>{t("complements")}</h3>
              {pairs.map((product) => (
                <button
                  className="complement"
                  key={product.id}
                  onClick={() => {
                    onProduct(product.id);
                  }}
                >
                  {product.name}
                  <Icon name="arrow" size={16} />
                </button>
              ))}
              <button
                className="studio-primary"
                onClick={() =>
                  onIntent(t("explorePrompt", { product: p.name }))
                }
              >
                {t("useKnowledge")}
                <Icon name="arrow" size={16} />
              </button>
            </>
          ) : (
            <p>{t("noProduct")}</p>
          )}
        </section>
      </div>
      <section className="studio-card">
        <h2>{t("searchKnowledge")}</h2>
        <form
          className="semantic-search"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(false);
            try {
              setResults(
                (await request("/api/knowledge/search", { query })).hits,
              );
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label={t("searchKnowledge")}
            placeholder={t("queryPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="studio-primary" disabled={!query.trim() || busy}>
            {busy ? t("thinking") : t("search")}
            <Icon name="search" size={16} />
          </button>
        </form>
        {error && <p role="alert">{t("failure")}</p>}
        {results?.map((hit) => (
          <button
            className="search-hit"
            key={hit.id}
            onClick={() => {
              onProduct(hit.id);
            }}
          >
            {data.products.find((p) => p.id === hit.id)?.name || hit.name}
            <span>{money(hit.price)}</span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {results?.length === 0 && <p>{t("searchEmpty")}</p>}
      </section>
      <section className="studio-card learning-card">
        <div>
          <span className="kicker">{t("evidence")}</span>
          <h2>{t("learns")}</h2>
          <p>{t("learnsText")}</p>
          <button
            className="studio-secondary"
            onClick={() => onIntent(t("learningPrompt"))}
          >
            {t("planExperience")}
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="learning-signals">
          {data.learning.variants.map((v) => (
            <div className="variant-signal" key={v.variant}>
              <div>
                <b>
                  {v.variant === "discovery" ? t("discovery") : t("comparison")}
                </b>
                <strong>
                  {new Intl.NumberFormat(locale, {
                    style: "percent",
                    maximumFractionDigits: 1,
                  }).format(v.estimate)}
                </strong>
              </div>
              <div className="signal-bar">
                <span
                  style={{ width: `${Math.min(100, v.estimate * 100)}%` }}
                />
              </div>
              <small>
                {number(v.views)} {t("views")} · {number(v.purchases)}{" "}
                {t("purchases")}
              </small>
            </div>
          ))}
          <p className="muted">{t("estimateHint")}</p>
          {data.learning.variants.every((v) => v.views === 0) && (
            <p>{t("noLearning")}</p>
          )}
        </div>
      </section>
      <section className="studio-card">
        <h2>{t("learningHistory")}</h2>
        <div className="learning-history">
          {data.learning.timeline.map((day) => (
            <div key={day.day}>
              <span>
                {new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                }).format(new Date(day.day + "T12:00:00Z"))}
              </span>
              <strong>{number(day.views)}</strong>
              <small>{t("views")}</small>
              <b>{number(day.rewarded)}</b>
              <small>{t("purchases")}</small>
            </div>
          ))}
        </div>
        <p className="muted">{t("learningHistoryHint")}</p>
      </section>
    </div>
  );
}
