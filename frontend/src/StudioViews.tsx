import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import ProductArt from "./ProductArt";
import { useLocale } from "./i18n";
import type { Overview, Product, RequestFn } from "./studio-types";
const guide =
  "https://github.com/sthamann/rust-ai-commerce/blob/main/docs/connectors.md";
export function OverviewView({
  data,
  onIntent,
  onProduct,
}: {
  data: Overview;
  onIntent: (s: string) => void;
  onProduct: (id: string) => void;
}) {
  const { t, money, date, number } = useLocale();
  const low = data.products.filter((p) => p.stock < 10);
  const maximum = Math.max(1, ...data.timeline.map((d) => d.orders));
  return (
    <div className="studio-page">
      <div className="page-intro">
        <span className="kicker">{t("basedOn")}</span>
        <h1>{t("shopPulse")}</h1>
        <p>{t("shopPulseSub")}</p>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <Icon name="pulse" />
          <span>{t("orders")}</span>
          <strong>{number(data.summary.orders)}</strong>
          <small>
            {data.summary.ordersToday} · {t("today")}
          </small>
        </div>
        <div className="metric">
          <Icon name="box" />
          <span>{t("revenue")}</span>
          <strong>{money(data.summary.revenue)}</strong>
          <small>
            {t("simulated")} · {t("lifetime")}
          </small>
        </div>
        <div className="metric">
          <Icon name="graph" />
          <span>{t("products")}</span>
          <strong>{data.products.length}</strong>
          <small>{t("lowStock", { count: low.length })}</small>
        </div>
        <div className="metric">
          <Icon name="chat" />
          <span>{t("pendingPlans")}</span>
          <strong>{data.summary.pendingPlans}</strong>
          <small>{t("assistant")}</small>
        </div>
      </div>
      <div className="overview-columns">
        <section className="studio-card">
          <div className="card-heading">
            <h2>{t("orderTrend")}</h2>
            <span className="soft-tag">{t("simulated")}</span>
          </div>
          <div
            className="order-chart"
            role="img"
            aria-label={data.timeline
              .map((d) => `${d.day}: ${d.orders}`)
              .join(", ")}
          >
            {data.timeline.map((d) => (
              <div className="chart-day" key={d.day}>
                <span>{d.orders}</span>
                <div className="bar-track">
                  <div style={{ height: `${(d.orders / maximum) * 100}%` }} />
                </div>
                <small>
                  {new Intl.DateTimeFormat(data.locale, {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(d.day + "T12:00:00"))}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="studio-card inventory-card">
          <div className="card-heading">
            <h2>{t("inventory")}</h2>
            <span className="soft-tag">{t("api")}</span>
          </div>
          {data.products.map((p) => (
            <button
              className="inventory-row"
              key={p.id}
              onClick={() => onProduct(p.id)}
            >
              <div className="mini-art">
                <ProductArt id={p.id} />
              </div>
              <span>
                {p.name}
                <small>{money(p.price)}</small>
              </span>
              <b className={p.stock < 10 ? "stock-low" : ""}>{p.stock}</b>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </section>
      </div>
      <section className="studio-card">
        <div className="card-heading">
          <h2>{t("recentOrders")}</h2>
          <span className="soft-tag">{t("simulated")}</span>
        </div>
        {data.orders.length ? (
          <div className="orders-table">
            {data.orders.map((o) => (
              <div className="order-row" key={o.id}>
                <span className="order-icon">
                  <Icon name="box" />
                </span>
                <b>{o.number}</b>
                <span>{date(o.time)}</span>
                <span className="channel-label">
                  {o.channel === "unknown" || !o.channel
                    ? t("unknown")
                    : o.channel.toUpperCase()}
                </span>
                <strong>{money(o.total)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note">{t("emptyOrders")}</p>
        )}
      </section>
      <div className="overview-columns">
        <section className="studio-card">
          <div className="card-heading">
            <h2>{t("activity")}</h2>
          </div>
          {data.activity.map((a, i) => (
            <div className="activity-row" key={a.id + i}>
              <span className="activity-dot" />
              <div>
                {a.kind === "order"
                  ? t("activityOrder")
                  : a.kind === "approved"
                    ? t("activityApproved")
                    : t("activityProposal")}
                <small>{date(a.time)}</small>
              </div>
            </div>
          ))}
          {!data.activity.length && <p>{t("noActivity")}</p>}
        </section>
        <section className="studio-card next-actions">
          <h2>{t("actions")}</h2>
          <button onClick={() => onIntent(t("askStock"))}>
            <Icon name="box" />
            {t("inventory")}
            <Icon name="arrow" />
          </button>
          <button onClick={() => onIntent(t("learningPrompt"))}>
            <Icon name="pulse" />
            {t("policy")}
            <Icon name="arrow" />
          </button>
          <button onClick={() => onIntent(t("promptRead"))}>
            <Icon name="graph" />
            {t("productKnowledge")}
            <Icon name="arrow" />
          </button>
        </section>
      </div>
    </div>
  );
}
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
export function AgentsView({
  data,
  onStorefront,
}: {
  data: Overview;
  onStorefront: () => void;
}) {
  const { t, number } = useLocale();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <div className="studio-page">
      <div className="page-intro">
        <span className="kicker">MCP / UCP</span>
        <h1>{t("agentTitle")}</h1>
        <p>{t("agentSub")}</p>
      </div>
      <section className="agent-journey">
        {[
          ["chat", "stepAsk", "stepAskText"],
          ["graph", "stepDiscover", "stepDiscoverText"],
          ["box", "stepCheckout", "stepCheckoutText"],
        ].map(([icon, title, body], i) => (
          <div key={title}>
            <span className="journey-icon">
              <Icon name={icon as "chat" | "graph" | "box"} />
              <small>0{i + 1}</small>
            </span>
            <h2>{t(title as "stepAsk")}</h2>
            <p>{t(body as "stepAskText")}</p>
          </div>
        ))}
      </section>
      <div className="connection-grid">
        {["ChatGPT", "Claude"].map((name) => (
          <section className="studio-card connection-card" key={name}>
            <div className="provider-symbol">{name.slice(0, 1)}</div>
            <div>
              <h2>{name}</h2>
              <span className="soft-tag pending">{t("notLinked")}</span>
            </div>
            <p>{t("remoteHint")}</p>
            <a
              href={guide}
              target="_blank"
              rel="noreferrer"
              className="studio-secondary"
            >
              {t("setupGuide")}
              <Icon name="arrow" size={16} />
            </a>
          </section>
        ))}
        <section className="studio-card connection-card">
          <div className="provider-symbol">
            <Icon name="link" />
          </div>
          <div>
            <h2>Claude Desktop / MCP</h2>
            <span className="soft-tag positive">{t("readyLocal")}</span>
          </div>
          <p>{t("mcpDesc")}</p>
          <button
            className="studio-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(data.connections.localMCPConfig, null, 2),
                );
                setCopied(true);
                setCopyFailed(false);
              } catch {
                setCopyFailed(true);
              }
            }}
          >
            {copied ? t("copied") : t("copyConfig")}
            <Icon name={copied ? "check" : "copy"} size={16} />
          </button>
          {copyFailed && <p role="alert">{t("copyFailed")}</p>}
        </section>
      </div>
      <div className="overview-columns">
        <section className="studio-card">
          <div className="card-heading">
            <h2>{t("channelCalls")}</h2>
            <span className="soft-tag">{t("api")}</span>
          </div>
          {["storefront", "mcp", "ucp"].map((name) => (
            <div className="channel-stat" key={name}>
              <span>
                {name === "storefront" ? t("stores") : name.toUpperCase()}
              </span>
              <strong>
                {number(
                  data.channels.find((c) => c.channel === name)?.calls || 0,
                )}
              </strong>
            </div>
          ))}
          <p className="muted">{t("channelHint")}</p>
        </section>
        <section className="studio-card">
          <div className="card-heading">
            <h2>UCP · {t("orders")}</h2>
            <span className="soft-tag positive">{t("readyLocal")}</span>
          </div>
          <p>{t("ucpDesc")}</p>
          <div className="protocol-path">
            {t("products")}
            <Icon name="arrow" size={14} />
            {t("quantity")}
            <Icon name="arrow" size={14} />
            {t("orders")}
          </div>
          <button className="studio-primary" onClick={onStorefront}>
            {t("checkoutDemo")}
            <Icon name="arrow" size={16} />
          </button>
        </section>
      </div>
      <section className="studio-card explanation-card">
        <Icon name="spark" />
        <div>
          <h2>{t("modelVsChannel")}</h2>
          <p>{t("modelVsChannelText")}</p>
        </div>
      </section>
    </div>
  );
}
export function PreviewPanel({
  product,
  request,
  connected,
  onIntent,
}: {
  product: Product | undefined;
  request: RequestFn;
  connected: boolean;
  onIntent: (s: string) => void;
}) {
  const { t, money, locale } = useLocale();
  const [quantity, setQuantity] = useState(1);
  const [group, setGroup] = useState("consumer");
  const [quote, setQuote] = useState<any>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    setQuantity(product?.min_purchase || 1);
    setQuote(undefined);
  }, [product?.id]);
  useEffect(() => {
    if (!product || !connected) return;
    const version = ++generation.current;
    setLoading(true);
    setQuote(undefined);
    setError(false);
    const timer = setTimeout(() => {
      request("/api/merchant/quote", {
        productId: product.id,
        quantity,
        customerGroup: group,
      })
        .then((v) => {
          if (version === generation.current) setQuote(v);
        })
        .catch(() => {
          if (version === generation.current) setError(true);
        })
        .finally(() => {
          if (version === generation.current) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [
    product?.id,
    product?.revision,
    quantity,
    group,
    locale,
    request,
    connected,
  ]);
  const line = quote?.quote.lineItems[0];
  return (
    <aside className="studio-preview">
      <div className="preview-heading">
        <Icon name="box" />
        <span>{t("livePreview")}</span>
      </div>
      {product ? (
        <>
          <div className="preview-art">
            <ProductArt id={product.id} />
          </div>
          <div className="preview-product">
            <span className="kicker">{product.id}</span>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <div className="product-price">
              <strong>{money(product.price)}</strong>
              <span>
                {product.stock} · {t("stock")}
              </span>
            </div>
          </div>
          <section className="price-playground">
            <div className="card-heading">
              <h3>{t("simulation")}</h3>
              <Icon name="pulse" size={18} />
            </div>
            <p>{t("simulationHint")}</p>
            <label>
              {t("group")}
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="consumer">{t("consumer")}</option>
                <option value="business">{t("business")}</option>
              </select>
            </label>
            <label>
              {t("quantity")}
              <div className="quantity-input">
                <button
                  aria-label="−"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <input
                  aria-label={t("quantity")}
                  type="number"
                  min="1"
                  max="10000"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(1, Math.min(10000, Number(e.target.value) || 1)),
                    )
                  }
                />
                <button
                  aria-label="+"
                  disabled={quantity >= 10000}
                  onClick={() => setQuantity((q) => Math.min(10000, q + 1))}
                >
                  +
                </button>
              </div>
            </label>
            <small>
              {t("quantitiesHint", {
                min: product.min_purchase,
                steps: product.purchase_steps,
              })}
            </small>
            <div
              className="quote-result"
              aria-live="polite"
              aria-busy={loading}
            >
              {error ? (
                <p role="alert">{t("failure")}</p>
              ) : line ? (
                <>
                  <div>
                    <span>{t("effectiveQuantity")}</span>
                    <b>{quote.effectiveQuantity}</b>
                  </div>
                  <div>
                    <span>{t("unitPrice")}</span>
                    <b>{money(line.price.unitPrice)}</b>
                  </div>
                  <div>
                    <span>{group === "business" ? t("net") : t("gross")}</span>
                    <strong>{money(quote.quote.price.positionPrice)}</strong>
                  </div>
                  <div className="quote-total">
                    <span>{t("total")}</span>
                    <strong>{money(quote.quote.price.totalPrice)}</strong>
                  </div>
                </>
              ) : (
                <p>{t("thinking")}</p>
              )}
            </div>
            <button
              className="studio-secondary"
              disabled={!connected}
              onClick={() =>
                onIntent(t("promptSim", { product: product.name }))
              }
            >
              {t("useKnowledge")}
              <Icon name="arrow" size={16} />
            </button>
          </section>
        </>
      ) : (
        <div className="preview-empty">
          <Icon name="graph" size={48} />
          <p>{t("connectFirst")}</p>
        </div>
      )}
    </aside>
  );
}
