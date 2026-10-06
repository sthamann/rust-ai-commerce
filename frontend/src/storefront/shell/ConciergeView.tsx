/** ConciergeView: storefront view composed from the scoped cart/controller. */
import { productURL } from "../catalog/product-url";
import { shopApi } from "../../shared/api/shop-api";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import "../styles/shop.css";

import { useStorefront } from "./StorefrontContext";
export default function ConciergeView() {
  const {
    s,
    run,
    wish,
    cart,
    setAdvice,
    setQuery,
    setCategory,
    setWish,
    busy,
    advice,
    products,
  } = useStorefront();
  const prompt = products.some((p) =>
    p.media[0]?.url.startsWith("/media/demo/fashion/"),
  )
    ? "fashionWish"
    : "wish";
  return (
    <section className="shop-concierge">
      <div>
        <p className="shop-kicker">{s("ask")}</p>
        <p>{s(prompt)}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const v = await shopApi<{
              answer: {
                explanation: string;
                recommended_ids: string[];
              };
            }>("/api/concierge", { request: wish }, cart?.token);
            setAdvice(v.answer);
            setQuery("");
            setCategory("all");
          });
        }}
      >
        <input
          aria-label={s("ask")}
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder={s(prompt)}
        />
        <button disabled={busy || !wish} className="shop-secondary">
          {busy ? s("thinking") : s("ask")} ↗
        </button>
      </form>
      {advice && (
        <div className="shop-advice" role="status">
          <p>{advice.explanation}</p>
          {advice.recommended_ids.map((pid) => (
            <a key={pid} href={productURL({ id: pid })}>
              {products.find((p) => p.id === pid)?.name} ↗
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
