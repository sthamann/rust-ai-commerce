/** Review source-bound candidates through shared HTTP/MCP contracts; changed sources block publication. */
import { useEffect, useState } from "react";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import type { Product, RequestFn } from "../shell/studio-types";
import type { Workspace } from "./knowledge-types";
type Claim = {
  id: string;
  revision: number;
  state: "proposed" | "evidenced" | "confirmed" | "rejected";
  sourceCurrent: boolean;
  sourcePublic: boolean;
  data: { text: string; quote: string; sourceId: string; locale: string };
};
export default function EvidenceReview({
  products,
  workspace,
  request,
}: {
  products: Product[];
  workspace: Workspace;
  request: RequestFn;
}) {
  const k = useKnowledgeText();
  const [product, setProduct] = useState(products[0]?.id ?? ""),
    [source, setSource] = useState(""),
    [claims, setClaims] = useState<Claim[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const value = await request("/api/intelligence/claims", {
      productId: product,
    });
    setClaims(value.claims);
  };
  useEffect(() => {
    let active = true;
    setClaims([]);
    if (product)
      request("/api/intelligence/claims", { productId: product })
        .then((v) => {
          if (active) setClaims(v.claims);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [product, request]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sources = workspace.sources.filter(
    (s) => !s.archived && (!s.product_id || s.product_id === product),
  );
  return (
    <section className="studio-card evidence-review">
      <header>
        <h2>{k("claimReview")}</h2>
        <p className="muted">{k("claimBoundary")}</p>
      </header>
      <div className="knowledge-form-grid">
        <label>
          {k("products")}
          <select
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setSource("");
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {k("sources")}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{k("chooseEvidenceSource")}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="studio-primary"
        disabled={busy || !source || !product || !workspace.canWrite}
        onClick={() =>
          void run(() =>
            request("/api/intelligence/extract", {
              sourceId: source,
              productId: product,
            }),
          )
        }
      >
        {k("extractCandidates")}
      </button>
      {error && (
        <p className="knowledge-alert" role="alert">
          {error}
        </p>
      )}
      {claims.map((claim) => (
        <article className="claim-review-card" key={claim.id}>
          <div className="claim-review-status">
            <span>{k(claim.state)}</span>
            <span>{claim.data.locale}</span>
          </div>
          <h3>{claim.data.text}</h3>
          <blockquote>{claim.data.quote}</blockquote>
          <p className="muted">
            {k("sources")}:{" "}
            {sources.find((s) => s.id === claim.data.sourceId)?.title ??
              claim.data.sourceId}
          </p>
          {!claim.sourceCurrent && <p role="alert">{k("claimStale")}</p>}
          <div className="knowledge-actions">
            {(["confirmed", "rejected"] as const).map((state) => (
              <button
                key={state}
                className="studio-secondary"
                disabled={
                  busy ||
                  !workspace.canWrite ||
                  (state === "confirmed" && !claim.sourceCurrent)
                }
                onClick={() =>
                  void run(() =>
                    request("/api/intelligence/claim.review", {
                      id: claim.id,
                      revision: claim.revision,
                      state,
                      approve: true,
                    }),
                  )
                }
              >
                {k(state === "confirmed" ? "confirmClaim" : "rejectClaim")}
              </button>
            ))}
          </div>
        </article>
      ))}
      {!claims.length && <p className="muted">{k("noClaimCandidates")}</p>}
    </section>
  );
}
