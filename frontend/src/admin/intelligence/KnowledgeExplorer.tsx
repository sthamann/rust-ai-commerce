/** Product-centred evidence inspector reads canonical facts and graph relationships beyond overview sampling. */
import { useEffect, useState } from "react";
import {
  useKnowledgeText,
  knowledgeWords,
  type KnowledgeWord,
} from "../../shared/i18n/knowledge-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
import KnowledgeFacts from "./KnowledgeFacts";
import ProductArt from "../../shared/ui/ProductArt";
import type { RequestFn, Product } from "../shell/studio-types";
import type { Source } from "./knowledge-types";
type Evidence = {
  product: Product & {
    properties: Record<string, unknown>;
    product_number: string;
    extra: {
      specifications?: Record<string, unknown>;
      identity?: { manufacturer?: string };
    };
  };
  needs: { need: string; source: string; confidence: number }[];
  complements: { id: string; name: string; source: string }[];
  observed: { id: string; orders: number; lastEvent: number; source: string }[];
  sources: {
    id: string;
    title: string;
    kind: Source["kind"];
    visibility: string;
    productId: string | null;
  }[];
  external: { app: string; sourceId: string }[];
  limit: number;
  stats: { variants: number; reviews: number; averageRating: number };
};
export default function KnowledgeExplorer({
  focus,
  products,
  request,
  onProduct,
  onIntent,
}: {
  focus: string;
  products: Product[];
  request: RequestFn;
  onProduct: (id: string) => void;
  onIntent: (s: string) => void;
}) {
  const k = useKnowledgeText(),
    { number } = useLocale();
  const [selected, setSelected] = useState(focus || products[0]?.id || ""),
    [evidence, setEvidence] = useState<Evidence>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [found, setFound] = useState<Product[]>(products);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setEvidence(undefined);
    setError("");
    setBusy(true);
    request(`/api/knowledge/product/${encodeURIComponent(selected)}`)
      .then((v) => {
        if (active) setEvidence(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [selected, request]);
  const relName = (id: string) =>
    found.find((p) => p.id === id)?.name ??
    products.find((p) => p.id === id)?.name ??
    id;
  const label = (need: string) =>
    `need_${need}` in knowledgeWords
      ? k(`need_${need}` as KnowledgeWord)
      : need;
  const p = evidence?.product;
  return (
    <div className="knowledge-explorer">
      <section className="studio-card">
        <h2>{k("pickProduct")}</h2>
        <form
          className="knowledge-search"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              setFound(
                (
                  await request("/api/search/product", {
                    search: query,
                    limit: 30,
                  })
                ).elements,
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <input
            aria-label={k("productSearch")}
            placeholder={k("productSearch")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="studio-secondary">{k("productSearch")}</button>
        </form>
        <div className="knowledge-product-list">
          {found.map((p) => (
            <button
              key={p.id}
              aria-pressed={p.id === selected}
              onClick={() => setSelected(p.id)}
            >
              <Icon name="box" />
              <span>
                {p.name}
                <small>{p.id}</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>
      <div>
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">{k("loading")}</p>}
        {evidence && p && (
          <>
            <section className="studio-card knowledge-product-summary">
              <div className="knowledge-product-image">
                {p.media?.[0]?.url ? (
                  <img src={p.media[0].url} alt="" />
                ) : (
                  <ProductArt id={p.id} />
                )}
              </div>
              <div>
                <span className="kicker">{k("snapshot")}</span>
                <h2>{p.name}</h2>
                <p>{p.description}</p>
                <button
                  className="studio-secondary"
                  onClick={() => onProduct(p.id)}
                >
                  {k("openProduct")}
                  <Icon name="arrow" />
                </button>
              </div>
            </section>
            <KnowledgeFacts product={p} stats={evidence.stats} />
            <section className="studio-card">
              <h2>{k("explorer")}</h2>
              <p className="muted">{k("sample")}</p>
              <div className="knowledge-relation-list">
                {evidence.needs.map((n) => (
                  <div key={n.need}>
                    <Icon name="graph" />
                    <div>
                      <strong>{label(n.need)}</strong>
                      <small>
                        {k("curated")} · {n.source} · {n.confidence}
                      </small>
                    </div>
                  </div>
                ))}
                {evidence.complements.map((n) => (
                  <button key={n.id} onClick={() => setSelected(n.id)}>
                    <Icon name="link" />
                    <div>
                      <strong>{n.name ?? relName(n.id)}</strong>
                      <small>
                        {k("complements")} · {n.source}
                      </small>
                    </div>
                    <Icon name="arrow" />
                  </button>
                ))}
                {evidence.observed.map((n) => (
                  <button
                    key={`observed:${n.id}`}
                    onClick={() => setSelected(n.id)}
                  >
                    <Icon name="pulse" />
                    <div>
                      <strong>{relName(n.id)}</strong>
                      <small>
                        {k("observed")} · {number(n.orders)} {k("orders")} ·{" "}
                        {k("source")} #{n.lastEvent}
                      </small>
                    </div>
                    <Icon name="arrow" />
                  </button>
                ))}
                {evidence.sources.map((s) => (
                  <div key={s.id}>
                    <Icon
                      name={s.visibility === "public" ? "layers" : "lock"}
                    />
                    <div>
                      <strong>{s.title}</strong>
                      <small>
                        {k(s.kind)} ·{" "}
                        {k(s.visibility === "public" ? "published" : "private")}{" "}
                        · {s.productId ?? k("shopWide")}
                      </small>
                    </div>
                  </div>
                ))}
                {evidence.external.map((s) => (
                  <div key={`${s.app}:${s.sourceId}`}>
                    <Icon name="lock" />
                    <div>
                      <strong>{s.app}</strong>
                      <small>
                        {k("private")} · {s.sourceId}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              {!evidence.needs.length &&
                !evidence.complements.length &&
                !evidence.sources.length &&
                !evidence.observed.length &&
                !evidence.external.length && <p>{k("noConnections")}</p>}
              <button
                className="studio-primary"
                onClick={() => onIntent(k("prompt") + p.name)}
              >
                {k("sendAssistant")}
                <Icon name="chat" />
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
