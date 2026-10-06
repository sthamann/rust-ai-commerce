/** ProductPurchase: focused pdp-purchase view with explicit typed inputs and callbacks. */
import { productURL } from "./product-url";
import { BRAND } from "../../shared/ui/Brand";
import { useShopText } from "../../shared/i18n/shop-i18n";

import { shopApi, type Detail } from "../../shared/api/shop-api";
import AppSlot from "../../shared/apps/AppSlot";
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";
import Icon from "../../shared/ui/Icon";
export type ProductPurchaseProps = {
  s: ReturnType<typeof useShopText>["s"];
  p: import("../../shared/api/shop-api").Product;
  data: import("../../shared/api/shop-api").Detail;
  money: ReturnType<typeof useShopText>["money"];
  tier: {
    quantity: number;
    price: import("../../shared/api/shop-api").Price;
    discountPercent: number;
  };
  groups: string[];
  variantsLoading: boolean;
  detailRequest: React.RefObject<number>;
  setVariantsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  id: string;
  cart: import("../../shared/api/shop-api").Cart | undefined;
  setData: React.Dispatch<
    React.SetStateAction<import("../../shared/api/shop-api").Detail | undefined>
  >;
  setError: React.Dispatch<React.SetStateAction<string>>;
  onCart: (c: import("../../shared/api/shop-api").Cart) => void;
  quantity: number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
  effective: number;
  busy: boolean;
  onAdd: (id: string, q: number) => void;
};
export default function ProductPurchase({
  s,
  p,
  data,
  money,
  tier,
  groups,
  variantsLoading,
  detailRequest,
  setVariantsLoading,
  id,
  cart,
  setData,
  setError,
  onCart,
  quantity,
  setQuantity,
  effective,
  busy,
  onAdd,
}: ProductPurchaseProps) {
  return (
    <section className="pdp-purchase">
      <p className="shop-kicker">
        {BRAND.name} / {s(p.category)}
      </p>
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
        {data.reviews.average.toFixed(1)} · {data.reviews.count} {s("reviews")}
      </button>
      <p>{p.description}</p>
      <div className="pdp-price">
        <strong>{money(tier.price.unitPrice)}</strong>
        {tier.price.listPrice &&
          tier.price.listPrice.price > tier.price.unitPrice && (
            <del>{money(tier.price.listPrice.price)}</del>
          )}
        <small>
          {s(data.taxStatus === "net" ? "net" : "gross")} · {s("shippingExtra")}
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
            {s(group)} <span>{s(p.options[group])}</span>
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
                      if (match) {
                        history.pushState(null, "", productURL(match));
                        window.dispatchEvent(new PopStateEvent("popstate"));
                      }
                    }}
                  >
                    {group === "color" && (
                      <i className={`swatch swatch-${option}`} />
                    )}{" "}
                    {s(option)}
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
      <div className={`availability ${p.stock ? "in-stock" : "out-of-stock"}`}>
        <i />
        {p.stock ? `${p.stock} ${s("available")}` : s("sold")}{" "}
        <span>SKU {p.product_number || p.id}</span>
      </div>
      {!p.stock && <small>{s("soldHint")}</small>}
      <AppSurfaceSlot location="product.detail" context={{ productId: p.id }} />
      <AppSlot
        productId={p.id}
        familyId={p.parent_id ?? p.id}
        cart={cart}
        onCart={onCart}
      />
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
  );
}
