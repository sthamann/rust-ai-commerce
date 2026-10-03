/** Product-scoped review publication; authoritative authorization stays in the API. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../../shared/api/types";
import { useShopText } from "../../shared/i18n/shop-i18n";
type Review = {
  id: string;
  productId: string;
  author: string;
  title: string;
  content: string;
  rating: number;
  approved: boolean;
};
export default function ReviewModeration({
  request,
  productId,
}: {
  request: RequestFn;
  productId: string;
}) {
  const { s } = useShopText();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setReviews([]);
    setError("");
    request("/api/merchant/commerce")
      .then((v) => {
        if (active)
          setReviews(
            v.reviews.filter((r: Review) => r.productId === productId),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request, productId]);
  return (
    <section className="studio-card">
      <h2>{s("moderation")}</h2>
      <p>{s("reviewHint")}</p>
      {error && <p role="alert">{error}</p>}
      {reviews.map((r) => (
        <article className="commerce-review" key={r.id}>
          <div>
            <strong>{r.title}</strong>
            <small>
              {r.author} · {r.rating}/5
            </small>
            <p>{r.content}</p>
          </div>
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await request(
                  `/api/merchant/reviews/${r.id}`,
                  { approved: !r.approved },
                  "PUT",
                );
                setReviews((rows) =>
                  rows.map((v) =>
                    v.id === r.id ? { ...v, approved: !r.approved } : v,
                  ),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {s(r.approved ? "hide" : "approve")}
          </button>
        </article>
      ))}
    </section>
  );
}
