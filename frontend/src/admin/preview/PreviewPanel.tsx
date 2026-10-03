/** PreviewPanel renders verified shop state and typed user actions. */
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
import ProductArt from "../../shared/ui/ProductArt";
import type { Product, RequestFn } from "../shell/studio-types";
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
