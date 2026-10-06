/** One-page checkout: server-reviewed selection, explicit purchase and durable provider handoff. */
import { useEffect, useRef, useState } from "react";
import type { Cart, Order, Selection } from "../../shared/api/shop-api";
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
import Icon from "../../shared/ui/Icon";
import CheckoutDetails from "./CheckoutDetails";
import CheckoutSummary from "./CheckoutSummary";
import PaymentSession from "./PaymentSession";
import CheckoutPurchase from "./CheckoutPurchase";
import CheckoutProgress from "./CheckoutProgress";
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
  requestError,
}: {
  requestError?: string;
  cart?: Cart;
  order?: Order;
  busy: boolean;
  onClose: () => void;
  onCart: (c: Cart) => void;
  onQuantity: (id: string, q: number) => void;
  onSelection: (s: Selection) => Promise<Cart>;
  onBuy: () => Promise<void>;
  onCoupons: (codes: string[]) => Promise<void>;
}) {
  const { s, money } = useShopText();
  const { x } = useCheckoutText();
  const ref = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<Selection>(
    cart?.checkout ?? {
      country: "DE",
      shippingMethodId: "pickup",
      paymentMethodId: "demo-card",
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reviewedRevision, setReviewedRevision] = useState<number>();
  const identity = `${cart?.id}:${cart?.customerId ?? ""}`;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // Preserve unsaved contact/address drafts when quantity or coupons refresh the cart.
  useEffect(() => {
    if (cart) {
      setSelection(cart.checkout);
      setReviewedRevision(undefined);
    }
  }, [identity]);
  const dirty =
    !!cart?.selectionNeedsConfirmation ||
    JSON.stringify(selection) !== JSON.stringify(cart?.checkout);
  const reviewed = !!cart && !dirty && reviewedRevision === cart.revision;
  const locked = busy || saving;
  const close = () => {
    if (!locked) onClose();
  };
  const submit = async () => {
    if (!cart || locked) return;
    setSaving(true);
    setError("");
    try {
      if (!reviewed) {
        const next = await onSelection(selection);
        setSelection(next.checkout);
        setReviewedRevision(next.revision);
      } else await onBuy();
    } catch (e) {
      setReviewedRevision(undefined);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="shop-bag vendune-checkout"
      onCancel={(e) => {
        if (locked) e.preventDefault();
        else close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-labelledby="bag-title"
    >
      <header className="bag-heading">
        <div>
          <p className="checkout-security">{x("secure")}</p>
          <h2 id="bag-title">{x("title")}</h2>
          <p>{x("subtitle")}</p>
        </div>
        <button
          type="button"
          disabled={locked}
          aria-label={s("close")}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </header>
      <CheckoutProgress reviewed={reviewed} complete={!!order} />
      <div className="bag-body">
        <AppSurfaceSlot
          location="cart.summary"
          context={{ itemCount: cart?.lineItems.length ?? 0 }}
        />
        {order ? (
          <section className="checkout-success">
            <Icon name="check" />
            <h3>
              {s("orderPlaced")} · {order.orderNumber}
            </h3>
            {order.payment.attemptId && cart ? (
              <PaymentSession
                autoRedirect
                id={order.payment.attemptId}
                token={cart.token}
              />
            ) : (
              <p>{s(order.payment.state)}</p>
            )}
            <button className="shop-secondary" onClick={close}>
              {x("back")}
            </button>
          </section>
        ) : !cart?.lineItems.length ? (
          <p>{s("empty")}</p>
        ) : (
          <div className="checkout-layout">
            <div className="checkout-form">
              <CheckoutDetails
                cart={cart}
                selection={selection}
                onChange={(patch) =>
                  setSelection((old) => ({ ...old, ...patch }))
                }
                onCart={onCart}
                busy={locked}
                onSubmit={submit}
              />
              {(error || requestError) && (
                <p className="shop-error" role="alert">
                  {error || requestError}
                </p>
              )}
            </div>
            <CheckoutSummary
              cart={cart}
              busy={locked}
              reviewed={reviewed}
              onQuantity={onQuantity}
              onCoupons={async (codes) => {
                setSaving(true);
                try {
                  await onCoupons(codes);
                } finally {
                  setSaving(false);
                }
              }}
              onClose={close}
            />
          </div>
        )}
      </div>
      {!order && cart?.lineItems.length ? (
        <footer className="checkout-mobile-action">
          <div>
            <small>{s("total")}</small>
            <strong>{money(cart.price.totalPrice)}</strong>
          </div>
          <CheckoutPurchase
            busy={locked}
            reviewed={reviewed}
            total={cart.price.totalPrice}
          />
        </footer>
      ) : null}
    </dialog>
  );
}
