/** Sticky order review presents authoritative totals and discounts beside the purchase action. */
import type { Cart } from "../../shared/api/shop-api";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
import { useState } from "react";
export default function CheckoutSummary({
  cart,
  busy,
  reviewed,
  onCoupons,
  onQuantity,
  onClose,
}: {
  cart: Cart;
  busy: boolean;
  reviewed: boolean;
  onCoupons: (codes: string[]) => Promise<void>;
  onQuantity: (id: string, q: number) => void;
  onClose: () => void;
}) {
  const { s, money, locale } = useShopText();
  const { w } = useWorkbenchText();
  const { x } = useCheckoutText();
  const [coupon, setCoupon] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <aside className="checkout-summary">
      <h3>
        {x("summary")}{" "}
        <span>{cart.lineItems.reduce((n, i) => n + i.quantity, 0)}</span>
      </h3>
      <div className="checkout-items">
        {cart.lineItems.map((item) => (
          <article className="checkout-item" key={item.id}>
            <a
              href={`#product/${encodeURIComponent(item.id)}`}
              onClick={onClose}
            >
              {item.media?.[0]?.url && (
                <img
                  src={item.media[0].url}
                  alt=""
                  width="48"
                  height="48"
                  loading="lazy"
                />
              )}
              <strong>{item.label}</strong>
              <small>
                {money(item.price.unitPrice)} ·{" "}
                {s(cart.price.taxStatus === "net" ? "net" : "gross")}
              </small>
            </a>
            <strong>{money(item.price.totalPrice)}</strong>
            <div className="shop-stepper">
              <button
                type="button"
                disabled={busy || item.quantity <= item.minPurchase}
                aria-label={`${s("quantity")} − ${item.label}`}
                onClick={() =>
                  onQuantity(item.id, item.quantity - item.purchaseSteps)
                }
              >
                −
              </button>
              <span>{item.quantity}</span>
              <button
                type="button"
                disabled={
                  busy ||
                  (item.maxPurchase != null &&
                    item.quantity + item.purchaseSteps > item.maxPurchase)
                }
                aria-label={`${s("quantity")} + ${item.label}`}
                onClick={() =>
                  onQuantity(item.id, item.quantity + item.purchaseSteps)
                }
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="shop-text-button"
              disabled={busy}
              onClick={() => onQuantity(item.id, 0)}
            >
              {s("remove")}
            </button>
          </article>
        ))}
      </div>
      <details className="checkout-coupon">
        <summary>{w("coupon")}</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError("");
            try {
              await onCoupons(coupon.trim() ? [coupon.trim()] : []);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            {w("coupon")}
            <input
              value={coupon}
              disabled={busy || saving}
              maxLength={64}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder={cart.couponCodes?.join(", ")}
            />
          </label>
          <button className="shop-secondary" disabled={busy || saving}>
            {w("applyCoupon")}
          </button>
        </form>
      </details>
      {cart.couponCodes?.length ? (
        <small>
          {cart.couponCodes.join(", ")} ·{" "}
          {cart.discounts?.length
            ? w("couponApplied")
            : w("couponNotApplicable")}
        </small>
      ) : null}
      <dl className="bag-totals">
        <div>
          <dt>{s("subtotal")}</dt>
          <dd>{money(cart.price.positionPrice)}</dd>
        </div>
        {cart.discounts?.map((d) => (
          <div key={d.id}>
            <dt>{d.name[locale.slice(0, 2)] ?? d.id}</dt>
            <dd>−{money(d.amount)}</dd>
          </div>
        ))}
        <div>
          <dt>{s("shipping")}</dt>
          <dd>{money(cart.shippingCosts.totalPrice)}</dd>
        </div>
        <div>
          <dt>{s("tax")}</dt>
          <dd>{money(cart.price.tax)}</dd>
        </div>
        <div className="grand-total">
          <dt>{s("total")}</dt>
          <dd>{money(cart.price.totalPrice)}</dd>
        </div>
      </dl>
      {cart.deliveries[0] && (
        <p className="delivery-estimate">
          {s("delivery")}: {cart.deliveries[0].deliveryDate.earliest} —{" "}
          {cart.deliveries[0].deliveryDate.latest}
        </p>
      )}
      <p className="checkout-note" role="status">
        {x(reviewed ? "reviewed" : "quoteHint")}
      </p>
      {cart.availablePaymentMethods.find(
        (p) => p.id === cart.checkout.paymentMethodId,
      )?.mode === "simulated" && <p className="shop-disclosure">{x("test")}</p>}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
