/** No-model evidence preview makes customer/private retrieval boundaries and missing facts inspectable. */
import { useState } from "react";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import Icon from "../../shared/ui/Icon";
import type { Product, RequestFn } from "../shell/studio-types";
import type { PreviewResult } from "./knowledge-types";
export default function KnowledgePreview({
  products,
  request,
  onIntent,
}: {
  products: Product[];
  request: RequestFn;
  onIntent: (s: string) => void;
}) {
  const k = useKnowledgeText();
  const [choices, setChoices] = useState(products),
    [search, setSearch] = useState("");
  const [product, setProduct] = useState(products[0]?.id ?? ""),
    [query, setQuery] = useState(""),
    [audience, setAudience] = useState("customer"),
    [result, setResult] = useState<PreviewResult>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="knowledge-preview-layout">
      <section className="studio-card">
        <span className="kicker">{k("preview")}</span>
        <h2>{k("question")}</h2>
        <p>{k("previewHint")}</p>
        <form
          className="knowledge-search"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              setChoices(
                (await request("/api/search/product", { search, limit: 30 }))
                  .elements,
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <input
            aria-label={k("productSearch")}
            placeholder={k("productSearch")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="studio-secondary">{k("productSearch")}</button>
        </form>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setResult(undefined);
            try {
              setResult(
                await request("/api/knowledge/preview", {
                  query,
                  productId: product || undefined,
                  audience,
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {k("audience")}
            <select
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
                setResult(undefined);
              }}
            >
              <option value="customer">{k("customer")}</option>
              <option value="merchant">{k("merchant")}</option>
            </select>
          </label>
          <label>
            {k("products")}
            <select
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setResult(undefined);
              }}
            >
              {audience === "merchant" && (
                <option value="">{k("shopWide")}</option>
              )}
              {product && !choices.some((p) => p.id === product) && (
                <option value={product}>
                  {products.find((p) => p.id === product)?.name ?? product}
                </option>
              )}
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {k("question")}
            <textarea
              value={query}
              rows={5}
              maxLength={2000}
              onChange={(e) => {
                setQuery(e.target.value);
                setResult(undefined);
              }}
            />
          </label>
          <button
            className="studio-primary"
            disabled={
              busy || !query.trim() || (audience === "customer" && !product)
            }
          >
            <Icon name="search" />
            {k("runPreview")}
          </button>
        </form>
        {busy && <p role="status">{k("loading")}</p>}
        {error && <p role="alert">{error}</p>}
      </section>
      <section className="studio-card">
        <h2>{k("usageTitle")}</h2>
        <ul className="knowledge-usage-list">
          {(
            ["usagePdp", "usageAgent", "usageRecommend", "usageFlow"] as const
          ).map((key) => (
            <li key={key}>
              <Icon name="check" />
              {k(key)}
            </li>
          ))}
        </ul>
        <p className="knowledge-boundary">{k("boundary")}</p>
        <button
          className="studio-secondary"
          onClick={() => onIntent(k("prompt") + (query || k("heading")))}
        >
          {k("sendAssistant")}
          <Icon name="chat" />
        </button>
      </section>
      {result && (
        <section className="studio-card knowledge-preview-results">
          <div className="knowledge-section-heading">
            <h2>{k("sources")}</h2>
            <span className="knowledge-badge">
              {k(result.audience === "customer" ? "published" : "private")} ·{" "}
              {result.locale}
            </span>
          </div>
          {result.product && (
            <div className="knowledge-snapshot">
              <span className="kicker">{k("snapshot")}</span>
              <h3>{result.product.name}</h3>
              <p>{result.product.description}</p>
              <small>{result.product.id}</small>
            </div>
          )}
          {result.sources.map((s) => (
            <article className="knowledge-excerpt" key={s.sourceId}>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
              <small>
                {s.sourceId} · {s.locale}
              </small>
              <details>
                <summary>{k("sourceHash")}</summary>
                <code>{s.contentHash}</code>
              </details>
            </article>
          ))}
          {result.external.map((s) => (
            <article
              className="knowledge-excerpt"
              key={`${s.app}:${s.sourceId}`}
            >
              <span className="knowledge-badge">
                <Icon name="lock" />
                {k("private")}
              </span>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
              <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                {s.app} · {k("source")}
              </a>
            </article>
          ))}
          {!result.sources.length && !result.external.length && (
            <p className="knowledge-empty">{k("previewEmpty")}</p>
          )}
        </section>
      )}
    </div>
  );
}
