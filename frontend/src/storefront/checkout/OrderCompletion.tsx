/** Dedicated completion page renders the accepted order snapshot and honest provider state, with no ID-only reads. */
import { useEffect, useRef } from "react";
import type { Order } from "../../shared/api/shop-api";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import AddressCard from "../../shared/customer/AddressCard";
import Icon from "../../shared/ui/Icon";
import PaymentSession from "./PaymentSession";
import CheckoutProgress from "./CheckoutProgress";
import OrderConfetti from "./OrderConfetti";
export default function OrderCompletion({
  order,
  onBack,
}: {
  order: Order;
  onBack: () => void;
}) {
  const { x } = useCheckoutText(),
    { s, money } = useShopText(),
    { c } = useCustomerText();
  const heading = useRef<HTMLHeadingElement>(null);
  const snapshot = order.cart;
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [order.id]);
  return (
    <main className="order-completion">
      <OrderConfetti />
      <CheckoutProgress reviewed complete />
      <div className="order-completion-hero">
        <span className="order-success-mark">
          <Icon name="check" size={32} />
        </span>
        <p className="shop-kicker">{s("orderPlaced")}</p>
        <h1 ref={heading} tabIndex={-1}>
          {x("received")}
        </h1>
        <p>{x("receivedHint")}</p>
        <div className="order-reference">
          <span>{x("orderNumber")}</span>
          <strong>{order.orderNumber}</strong>
        </div>
      </div>
      <div className="order-completion-grid">
        <section className="completion-card">
          <h2>{x("summary")}</h2>
          {snapshot.lineItems.map((item) => (
            <article className="completion-item" key={item.id}>
              {item.media?.[0]?.url && (
                <img src={item.media[0].url} width={64} height={80} alt="" />
              )}
              <div>
                <strong>{item.label}</strong>
                <small>
                  {s("quantity")}: {item.quantity}
                </small>
              </div>
              <strong>{money(item.price.totalPrice)}</strong>
            </article>
          ))}
          <dl className="bag-totals">
            <div>
              <dt>{s("shipping")}</dt>
              <dd>{money(snapshot.shippingCosts.totalPrice)}</dd>
            </div>
            <div>
              <dt>{s("tax")}</dt>
              <dd>{money(snapshot.price.tax)}</dd>
            </div>
            {!!snapshot.discountTotal && (
              <div>
                <dt>{s("discount")}</dt>
                <dd>−{money(snapshot.discountTotal)}</dd>
              </div>
            )}
            <div className="grand-total">
              <dt>{s("total")}</dt>
              <dd>{money(snapshot.price.totalPrice)}</dd>
            </div>
          </dl>
        </section>
        <section className="completion-card">
          <h2>{c("shippingAddress")}</h2>
          <AddressCard address={snapshot.checkout.address} />
          <h2>{c("billingAddress")}</h2>
          <AddressCard address={snapshot.checkout.billingAddress} />
          {snapshot.customerEmail && <p>{snapshot.customerEmail}</p>}
          <h2>{s("payment")}</h2>
          {order.payment.attemptId ? (
            <PaymentSession
              autoRedirect
              id={order.payment.attemptId}
              token={snapshot.token}
            />
          ) : (
            <>
              <p>{s(order.payment.state)}</p>
              {order.payment.realMoneyCharged === false && (
                <p className="shop-disclosure">{x("test")}</p>
              )}
            </>
          )}
          {order.deliveries?.[0] && (
            <p className="delivery-estimate">
              {s("delivery")}: {order.deliveries[0].deliveryDate.earliest} —{" "}
              {order.deliveries[0].deliveryDate.latest}
            </p>
          )}
        </section>
      </div>
      <button className="shop-primary completion-back" onClick={onBack}>
        {x("back")}
        <Icon name="arrow" />
      </button>
    </main>
  );
}
