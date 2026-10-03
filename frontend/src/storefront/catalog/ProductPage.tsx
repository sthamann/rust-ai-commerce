/** Product family, gallery, context pricing and moderated customer reviews. */
import RichDescription from "../../shared/content/RichDescription";
import { analyticsItems, commerceEvent } from "../analytics/ShopAnalytics";
import ProductAttachments from "./ProductAttachments";
import ProductPurchase from "./ProductPurchase";
import ProductReviews from "./ProductReviews";

import { useEffect, useRef, useState } from "react";
import { shopApi, type Cart, type Detail } from "../../shared/api/shop-api";
import { useShopText } from "../../shared/i18n/shop-i18n";
import MemoryRecommendations from "./MemoryRecommendations";
import ProductQuestion from "./ProductQuestion";
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
  const tracked = useRef("");
  useEffect(() => {
    const emit = () => {
      if (
        data &&
        tracked.current !== data.product.id &&
        commerceEvent("view_item", { items: analyticsItems([data.product]) })
      ) {
        commerceEvent("page_view", {});
        tracked.current = data.product.id;
      }
    };
    emit();
    window.addEventListener("commerce:analytics-ready", emit);
    return () => window.removeEventListener("commerce:analytics-ready", emit);
  }, [data]);
  useEffect(() => {
    const seo = data?.product.extra?.seo?.[locale.slice(0, 2)];
    if (seo) {
      document.title = seo.title;
      let meta = document.querySelector<HTMLMetaElement>(
        'meta[name="description"]',
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.append(meta);
      }
      meta.content = seo.description;
    }
  }, [data, locale]);
  if (!data)
    return (
      <main className="shop-content" aria-busy={!error}>
        <a href="#">← {s("back")}</a>
        <p role={error ? "alert" : "status"}>{error || s("loading")}</p>
      </main>
    );
  const p = data.product;
  const specs =
    p.extra?.specifications?.[locale.slice(0, 2)] ??
    p.extra?.specifications?.en ??
    {};
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
        <ProductPurchase
          s={s}
          p={p}
          data={data}
          money={money}
          tier={tier}
          groups={groups}
          variantsLoading={variantsLoading}
          detailRequest={detailRequest}
          setVariantsLoading={setVariantsLoading}
          id={id}
          cart={cart}
          setData={setData}
          setError={setError}
          onCart={onCart}
          quantity={quantity}
          setQuantity={setQuantity}
          effective={effective}
          busy={busy}
          onAdd={onAdd}
        />
      </div>
      <div className="pdp-details">
        <section>
          <p className="shop-kicker">01 / {s("description")}</p>
          <h2>{s("description")}</h2>
          {p.extra?.richDescription?.[locale.slice(0, 2)]?.length ? (
            <RichDescription
              blocks={p.extra.richDescription[locale.slice(0, 2)]}
            />
          ) : (
            <p>{p.description}</p>
          )}
          <ProductAttachments id={p.id} />
          <p className="product-material">
            {s(p.properties.material ?? "")} · atelier /
          </p>
        </section>
        <section>
          <p className="shop-kicker">02 / {s("properties")}</p>
          <h2>{s("properties")}</h2>
          <dl>
            {Object.entries({ ...p.properties, ...specs }).map(
              ([key, value]) => (
                <div key={key}>
                  <dt>{s(key)}</dt>
                  <dd>{s(value)}</dd>
                </div>
              ),
            )}
          </dl>
        </section>
      </div>
      <ProductQuestion productId={p.id} />
      {p.extra?.crossSelling?.length ? (
        <section className="app-slot">
          {p.extra.crossSelling.map((id) => (
            <a key={id} href={`#product/${encodeURIComponent(id)}`}>
              {id} ↗
            </a>
          ))}
        </section>
      ) : null}
      <MemoryRecommendations productId={p.id} />
      <ProductReviews
        s={s}
        data={data}
        reviewed={reviewed}
        cart={cart}
        setSending={setSending}
        setError={setError}
        id={id}
        setReviewed={setReviewed}
        sending={sending}
        error={error}
      />
    </main>
  );
}
