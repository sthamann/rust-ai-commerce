/** Product family, gallery, context pricing and moderated customer reviews. */
import { useEffect, useRef, useState } from "react";
import { useShopText } from "./shop-i18n";
import { shopApi, type Cart, type Detail } from "./shop-api";
import MemoryRecommendations from "./MemoryRecommendations";
import AppSlot from "./AppSlot";
import Icon from "./Icon";
export default function ProductPage({
  id,
  cart,
  busy,
  onAdd,
  onCart,
}: {
  id: string;
  cart?: Cart;
  busy: boolean;
  onAdd: (id: string, q: number) => void;
  onCart: (c: Cart) => void;
}) {
  const { s, money, locale } = useShopText();
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState("");
  const [image, setImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [sending, setSending] = useState(false);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const detailRequest = useRef(0);
  useEffect(() => {
    ++detailRequest.current;
    let active = true;
    setData(undefined);
    setError("");
    setImage(0);
    setReviewed(false);
    shopApi<Detail>(
      `/store-api/product/${encodeURIComponent(id)}`,
      {},
      cart?.token,
    )
      .then((d) => {
        if (active) {
          setData(d);
          setQuantity(d.product.min_purchase);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      ++detailRequest.current;
    };
  }, [id, locale, cart?.token, cart?.customerGroup, cart?.checkout.country]);
  if (!data)
    return (
      <main className="shop-content" aria-busy={!error}>
        <a href="#">← {s("back")}</a>
        <p role={error ? "alert" : "status"}>{error || s("loading")}</p>
      </main>
    );
  const p = data.product;
  const effective = Math.max(
    p.min_purchase,
    Math.floor(
      (Math.min(quantity, p.max_purchase ?? 10000) - p.min_purchase) /
        p.purchase_steps,
    ) *
      p.purchase_steps +
      p.min_purchase,
  );
  const tier =
    [...data.calculatedPrices].reverse().find((v) => effective >= v.quantity) ??
    data.calculatedPrices[0];
  const groups = [
    ...new Set(data.variants.flatMap((v) => Object.keys(v.options))),
  ];
  return (
    <main className="shop-content pdp">
      <a className="shop-back" href="#">
        ← {s("back")}
      </a>
      <div className="pdp-main">
        <section className="pdp-gallery" aria-label={s("images")}>
          <div className="gallery-main">
            <img
              src={p.media[image]?.url}
              alt={`${p.name} · ${Object.values(p.options).map(s).join(" / ")} · ${s(p.media[image]?.view ?? "front")}`}
              width="780"
              height="600"
            />
            <span>
              {s("images")} · {image + 1} / {p.media.length}
            </span>
          </div>
          <div className="gallery-thumbs">
            {p.media.map((m, i) => (
              <button
                key={m.id}
                aria-label={s(m.view)}
                aria-pressed={i === image}
                onClick={() => setImage(i)}
              >
                <img src={m.url} alt="" width="90" height="70" />
                <span>{s(m.view)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="pdp-purchase">
          <p className="shop-kicker">ATELIER / {s(p.category)}</p>
          <h1>{p.name}</h1>
          <button
            className="rating-link"
            onClick={() =>
              document
                .getElementById("product-reviews")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span aria-hidden="true">
              {"★".repeat(Math.round(data.reviews.average))}
              {"☆".repeat(5 - Math.round(data.reviews.average))}
            </span>{" "}
            {data.reviews.average.toFixed(1)} · {data.reviews.count}{" "}
            {s("reviews")}
          </button>
          <p>{p.description}</p>
          <div className="pdp-price">
            <strong>{money(tier.price.unitPrice)}</strong>
            {tier.price.listPrice &&
              tier.price.listPrice.price > tier.price.unitPrice && (
                <del>{money(tier.price.listPrice.price)}</del>
              )}
            <small>
              {s(data.taxStatus === "net" ? "net" : "gross")} ·{" "}
              {s("shippingExtra")}
            </small>
          </div>
          {tier.price.referencePrice && (
            <small>
              {money(tier.price.referencePrice.price)} /{" "}
              {tier.price.referencePrice.reference_unit}{" "}
              {tier.price.referencePrice.unit_name}
            </small>
          )}
          {groups.map((group) => (
            <fieldset className="variant-group" key={group}>
              <legend>
                {s(group)}{" "}
                <span>
                  {s(p.options[group])}
                  {group === "size" ? " ml" : ""}
                </span>
              </legend>
              <div>
                {[...new Set(data.variants.map((v) => v.options[group]))].map(
                  (option) => {
                    const match = data.variants.find(
                      (v) =>
                        v.options[group] === option &&
                        groups.every(
                          (g) => g === group || v.options[g] === p.options[g],
                        ),
                    );
                    return (
                      <button
                        key={option}
                        aria-pressed={p.options[group] === option}
                        title={!match ? s("invalidOption") : undefined}
                        disabled={!match}
                        onClick={() => {
                          if (match) location.hash = `product/${match.id}`;
                        }}
                      >
                        {group === "color" && (
                          <i className={`swatch swatch-${option}`} />
                        )}{" "}
                        {s(option)}
                        {group === "size" ? " ml" : ""}
                      </button>
                    );
                  },
                )}
              </div>
            </fieldset>
          ))}
          {data.variantsPagination.nextCursor && (
            <button
              className="shop-secondary"
              disabled={variantsLoading}
              onClick={async () => {
                const request = detailRequest.current;
                setVariantsLoading(true);
                try {
                  const page = await shopApi<Detail>(
                    `/store-api/product/${encodeURIComponent(id)}?after=${encodeURIComponent(data.variantsPagination.nextCursor!)}&limit=50`,
                    {},
                    cart?.token,
                  );
                  if (request === detailRequest.current)
                    setData((previous) =>
                      previous
                        ? {
                            ...previous,
                            variants: [
                              ...new Map(
                                [...previous.variants, ...page.variants].map(
                                  (v) => [v.id, v],
                                ),
                              ).values(),
                            ],
                            variantsPagination: page.variantsPagination,
                          }
                        : previous,
                    );
                } catch (e) {
                  if (request === detailRequest.current)
                    setError((e as Error).message);
                } finally {
                  setVariantsLoading(false);
                }
              }}
            >
              {variantsLoading ? s("loading") : s("moreVariants")}
            </button>
          )}
          <div
            className={`availability ${p.stock ? "in-stock" : "out-of-stock"}`}
          >
            <i />
            {p.stock ? `${p.stock} ${s("available")}` : s("sold")}{" "}
            <span>SKU {p.id}</span>
          </div>
          {!p.stock && <small>{s("soldHint")}</small>}
          <AppSlot productId={p.id} cart={cart} onCart={onCart} />
          <div className="pdp-buy">
            <label>
              {s("quantity")}
              <input
                type="number"
                min={p.min_purchase}
                max={p.max_purchase ?? 10000}
                step={p.purchase_steps}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(1, Math.min(10000, Number(e.target.value) || 1)),
                  )
                }
                onBlur={() => setQuantity(effective)}
              />
            </label>
            <button
              className="shop-primary"
              disabled={busy || !cart || effective > p.stock}
              onClick={() => onAdd(p.id, effective)}
            >
              {s("add")}
              <Icon name="plus" size={18} />
            </button>
          </div>
          <small>
            {s("min")}: {p.min_purchase} · {s("steps")}: {p.purchase_steps}
            {p.max_purchase ? ` · ${s("max")}: ${p.max_purchase}` : ""}
          </small>
          {data.calculatedPrices.length > 1 && (
            <div className="tier-prices">
              <h3>{s("tiers")}</h3>
              <table>
                <thead>
                  <tr>
                    <th>{s("quantity")}</th>
                    <th>{s("per")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.calculatedPrices.map((t) => (
                    <tr
                      key={t.quantity}
                      className={t.quantity === tier.quantity ? "selected" : ""}
                    >
                      <td>
                        {s("from")} {t.quantity}
                      </td>
                      <td>
                        {money(t.price.unitPrice)}
                        {t.discountPercent > 0 && (
                          <span> −{t.discountPercent}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="delivery-note">
            <Icon name="box" />
            <div>
              <strong>{s("delivery")}</strong>
              <p>
                {data.delivery?.maxDays === 0
                  ? s("readyToday")
                  : `${data.delivery?.minDays}–${data.delivery?.maxDays} ${s("days")}`}{" "}
                · {s(data.delivery?.method.name ?? "shipping")}
              </p>
              <small>
                {s("shippingExtra")} · {s(data.country)}
              </small>
            </div>
          </div>
        </section>
      </div>
      <div className="pdp-details">
        <section>
          <p className="shop-kicker">01 / {s("description")}</p>
          <h2>{s("description")}</h2>
          <p>{p.description}</p>
          <p className="product-material">
            {s(p.properties.material ?? "")} · atelier /
          </p>
        </section>
        <section>
          <p className="shop-kicker">02 / {s("properties")}</p>
          <h2>{s("properties")}</h2>
          <dl>
            {Object.entries(p.properties).map(([key, value]) => (
              <div key={key}>
                <dt>{s(key)}</dt>
                <dd>{s(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <MemoryRecommendations productId={p.id} />
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
    </main>
  );
}
