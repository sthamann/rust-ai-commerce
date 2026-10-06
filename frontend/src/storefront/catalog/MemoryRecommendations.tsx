/** Public consumer of merchant-approved learned associations, hydrated with current product state. */
import { productURL } from "./product-url";
import { useEffect, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useAppText } from "../../shared/i18n/app-i18n";
export default function MemoryRecommendations({
  productId,
}: {
  productId: string;
}) {
  const { a, money, locale } = useAppText();
  const [products, setProducts] = useState<
    { id: string; name: string; price: number }[]
  >([]);
  useEffect(() => {
    let active = true;
    shopApi<{ elements: typeof products }>(
      `/store-api/intelligence/recommendations/${encodeURIComponent(productId)}`,
    )
      .then((v) => {
        if (active) setProducts(v.elements);
      })
      .catch(() => {
        if (active) setProducts([]);
      });
    return () => {
      active = false;
    };
  }, [productId, locale]);
  if (!products.length) return null;
  return (
    <section className="pdp-recommendations">
      <h2>{a("recommended")}</h2>
      <div>
        {products.map((p) => (
          <a key={p.id} href={productURL(p)}>
            <img
              src={`/media/${p.id}-front.svg`}
              alt=""
              width="150"
              height="120"
            />
            <strong>{p.name}</strong>
            <span>{money(p.price)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
