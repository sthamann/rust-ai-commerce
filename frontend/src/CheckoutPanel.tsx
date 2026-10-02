import { useCustomerText } from "./customer-i18n";
import CheckoutDetails from "./CheckoutDetails";
import { addressComplete } from "./customer-types";
import { useWorkbenchText } from "./workbench-i18n";
/** Accessible cart dialog: authoritative totals, delivery context and checkout. */
import { useEffect, useRef, useState } from "react";
import { useShopText } from "./shop-i18n";
import type { Cart, Order, Selection } from "./shop-api";
import PaymentSession from "./PaymentSession";
import Icon from "./Icon";
export default function CheckoutPanel({
  cart,
  order,
  busy,
  onClose,
  onQuantity,
  onSelection,
  onBuy,
  onCoupons,
  onCart,
}: {
  cart?: Cart;
  order?: Order;
  busy: boolean;
  onClose: () => void;
  onCart: (c: Cart) => void;
  onQuantity: (id: string, q: number) => void;
  onSelection: (s: Selection) => Promise<void>;
  onBuy: () => void;
  onCoupons: (codes: string[]) => Promise<void>;
}) {
  const { s, money } = useShopText();
  const { c } = useCustomerText();
  const ref = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<Selection>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coupon, setCoupon] = useState("");
  const { w, locale } = useWorkbenchText();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => setSelection(cart?.checkout), [cart?.revision, cart?.id]);
  const dirty =
    !!cart?.selectionNeedsConfirmation ||
    JSON.stringify(selection) !== JSON.stringify(cart?.checkout);
  const set = (patch: Partial<Selection>) =>
    setSelection((old) => (old ? { ...old, ...patch } : old));
  return (
    <dialog
      ref={ref}
      className="shop-bag"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="bag-title"
    >
      <div className="bag-heading">
        <h2 id="bag-title">{s("bag")}</h2>
        <button aria-label={s("close")} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="bag-body">
        {order && (
          <div className="order-confirmation" role="status">
            <Icon name="check" />
            <div>
              <strong>
                {s("orderPlaced")} · {order.orderNumber}
              </strong>
              <p>
                {s(
                  order.payment.state === "pending"
                    ? "pending-payment"
                    : order.payment.state,
                )}{" "}
                · {s(order.deliveries?.[0]?.state ?? "open")}
              </p>
              <small>
                {order.deliveries?.[0]?.deliveryDate.earliest} —{" "}
                {order.deliveries?.[0]?.deliveryDate.latest}
              </small>
            </div>
          </div>
        )}
        {order?.payment.attemptId && cart && (
          <PaymentSession id={order.payment.attemptId} token={cart.token} />
        )}
        {!cart?.lineItems.length ? (
          <p>{s("empty")}</p>
        ) : (
          <>
            {cart.lineItems.map((i) => (
              <div className="bag-item" key={i.id}>
                <a href={`#product/${i.id}`} onClick={onClose}>
                  <img
                    src={`/media/${i.id}-front.svg`}
                    alt=""
                    width="80"
                    height="70"
                  />
                  <div>
                    <strong>{i.label}</strong>
                    <small>{i.id}</small>
                    <small>
                      {money(i.price.unitPrice)}{" "}
                      {s(cart.price.taxStatus === "net" ? "net" : "gross")}
                    </small>
                  </div>
                </a>
                <div className="bag-item-actions">
                  <div className="shop-stepper">
                    <button
                      disabled={busy || i.quantity <= i.minPurchase}
                      aria-label={`${s("quantity")} − ${i.label}`}
                      onClick={() =>
                        onQuantity(i.id, i.quantity - i.purchaseSteps)
                      }
                    >
                      −
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      disabled={
                        busy ||
                        (i.maxPurchase != null &&
                          i.quantity + i.purchaseSteps > i.maxPurchase)
                      }
                      aria-label={`${s("quantity")} + ${i.label}`}
                      onClick={() =>
                        onQuantity(i.id, i.quantity + i.purchaseSteps)
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="shop-text-button"
                    disabled={busy}
                    onClick={() => onQuantity(i.id, 0)}
                  >
                    {s("remove")}
                  </button>
                </div>
              </div>
            ))}
            {selection && (
              <CheckoutDetails
                cart={cart}
                selection={selection}
                onChange={set}
                onCart={onCart}
                busy={busy}
                dirty={dirty}
                onSave={() => onSelection(selection)}
              />
            )}
            <form
              className="checkout-selection"
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
                  onChange={(e) => setCoupon(e.target.value)}
                  maxLength={64}
                  placeholder={cart.couponCodes?.join(", ")}
                />
              </label>
              <button className="shop-secondary" disabled={busy || saving}>
                {w("applyCoupon")}
              </button>
              {!!cart.couponCodes?.length && (
                <small>
                  {cart.couponCodes.join(", ")} ·{" "}
                  {cart.discounts?.length
                    ? w("couponApplied")
                    : w("couponNotApplicable")}
                </small>
              )}
            </form>
            {cart.discounts?.map((d) => (
              <p key={d.id}>
                {d.name[locale.slice(0, 2)] ?? d.id} · −{money(d.amount)}
              </p>
            ))}
            <dl className="bag-totals">
              <div>
                <dt>{s("subtotal")}</dt>
                <dd>
                  {money(cart.price.positionPrice)}{" "}
                  {cart.price.taxStatus === "net" && s("net")}
                </dd>
              </div>
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
            <button
              className="shop-primary"
              disabled={
                busy ||
                saving ||
                dirty ||
                !cart.lineItems.length ||
                !addressComplete(selection?.billingAddress) ||
                !(selection?.customerEmail ?? cart.customerEmail)
              }
              onClick={onBuy}
            >
              {busy
                ? s("processing")
                : cart.availablePaymentMethods.find(
                      (p) => p.id === selection?.paymentMethodId,
                    )?.mode === "simulated"
                  ? s("buy")
                  : c("placeOrder")}
              <Icon name="arrow" size={18} />
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <p className="shop-disclosure">{s("simulation")}</p>
      </div>
    </dialog>
  );
}
