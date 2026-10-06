/** Clickable purchase cards show the live server status and lead to a protected order detail. */
import { useAccountText } from "../../shared/i18n/account-i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import type { CustomerOrder } from "./account-types";
export default function AccountOrderList({
  orders,
  onSelect,
  onShop,
}: {
  orders: CustomerOrder[];
  onSelect: (id: string) => void;
  onShop: () => void;
}) {
  const { a, locale } = useAccountText(),
    { o } = useOperationsText(),
    { money } = useShopText();
  if (!orders.length)
    return (
      <div className="account-empty">
        <span aria-hidden="true">◇</span>
        <h3>{a("emptyOrders")}</h3>
        <p>{a("emptyOrdersHint")}</p>
        <button className="shop-primary" onClick={onShop}>
          {a("continueShopping")}
        </button>
      </div>
    );
  return (
    <div className="account-orders">
      {orders.map((order) => (
        <button
          className="account-order-card"
          key={order.id}
          onClick={() => onSelect(order.id)}
          aria-label={`${a("viewOrder")} ${order.orderNumber}`}
        >
          <div className="account-order-heading">
            <div>
              <strong>{order.orderNumber}</strong>
              <small>
                {order.createdAt &&
                  new Date(order.createdAt).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
              </small>
            </div>
            <strong>{money(order.cart.price.totalPrice)}</strong>
          </div>
          <div className="account-order-products">
            {order.cart.lineItems.slice(0, 3).map((item) => (
              <span key={item.id}>
                {item.media?.[0]?.url && (
                  <img src={item.media[0].url} alt="" loading="lazy" />
                )}
                <span>
                  {item.quantity} × {item.label}
                </span>
              </span>
            ))}
          </div>
          <div className="account-order-footer">
            <span className="account-badge">
              {order.stateLabels?.[order.state]?.[locale.slice(0, 2)] ??
                order.stateLabels?.[order.state]?.en ??
                o(order.state)}
            </span>
            <span>
              {a("viewOrder")} <span aria-hidden="true">↗</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
