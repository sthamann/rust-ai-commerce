/** ProductReviews: focused pdp-reviews view with explicit typed inputs and callbacks. */
import { useShopText } from "../../shared/i18n/shop-i18n";

import { shopApi } from "../../shared/api/shop-api";
export type ProductReviewsProps = {
  s: ReturnType<typeof useShopText>["s"];
  data: import("../../shared/api/shop-api").Detail;
  reviewed: boolean;
  cart: import("../../shared/api/shop-api").Cart | undefined;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  id: string;
  setReviewed: React.Dispatch<React.SetStateAction<boolean>>;
  sending: boolean;
  error: string;
};
export default function ProductReviews({
  s,
  data,
  reviewed,
  cart,
  setSending,
  setError,
  id,
  setReviewed,
  sending,
  error,
}: ProductReviewsProps) {
  return (
    <section className="pdp-reviews" id="product-reviews">
      <div>
        <p className="shop-kicker">03 / {s("reviews")}</p>
        <h2>
          {s("reviews")} <span>{data.reviews.count}</span>
        </h2>
        {!data.reviews.count && <p>{s("noReviews")}</p>}
        {data.reviews.elements.map((r) => (
          <article className="review" key={r.id}>
            <div>
              <strong>{r.author}</strong>
              <span aria-label={`${r.rating} / 5`}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </span>
            </div>
            <h3>{r.title}</h3>
            <p>{r.content}</p>
            {r.verifiedPurchase && <small>{s("verified")}</small>}
            {r.demo && <small>{s("demoReview")}</small>}
          </article>
        ))}
      </div>
      <div className="review-form">
        <h3>{s("review")}</h3>
        {reviewed ? (
          <p role="status">{s("pending")}</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!cart) return;
              setSending(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                await shopApi(
                  `/store-api/product/${id}/reviews`,
                  {
                    author: form.get("author"),
                    rating: Number(form.get("rating")),
                    title: form.get("title"),
                    content: form.get("content"),
                  },
                  cart.token,
                );
                setReviewed(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSending(false);
              }
            }}
          >
            <label>
              {s("author")}
              <input name="author" required maxLength={80} />
            </label>
            <label>
              {s("rating")}
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              {s("title")}
              <input name="title" required maxLength={120} />
            </label>
            <label>
              {s("content")}
              <textarea name="content" required maxLength={3000} rows={4} />
            </label>
            <button className="shop-primary" disabled={sending || !cart}>
              {s("sendReview")}
            </button>
            <small>{s("reviewHint")}</small>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
