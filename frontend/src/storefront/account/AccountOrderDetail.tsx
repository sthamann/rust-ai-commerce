/** Purchase detail uses immutable addresses, current fulfillment, issued PDFs and paid order entitlements. */
import { useEffect, useState } from "react";
import { useAccountText } from "../../shared/i18n/account-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { safeRichUrl } from "../../shared/content/rich-document";
import AddressCard from "../../shared/customer/AddressCard";
import { shopApi } from "../../shared/api/shop-api";
import AccountDownloads from "./AccountDownloads";
import type { CustomerOrder, CustomerDownload } from "./account-types";
export default function AccountOrderDetail({
  id,
  onBack,
  onOrder,
  downloads,
  download,
  busy,
  run,
  onError,
  reload,
}: {
  id: string;
  onBack: () => void;
  onOrder: (id: string) => void;
  downloads: CustomerDownload[];
  download: (path: string) => Promise<void>;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onError: (e: unknown) => void;
  reload?: () => Promise<void>;
}) {
  const { a, locale } = useAccountText(),
    { c } = useCustomerText(),
    { o } = useOperationsText(),
    { money } = useShopText();
  const [order, setOrder] = useState<CustomerOrder>();
  const [loading, setLoading] = useState(true);
  const path = `/store-api/account/orders/${encodeURIComponent(id)}`;
  useEffect(() => {
    let active = true;
    setOrder(undefined);
    setLoading(true);
    void shopApi<CustomerOrder>(path)
      .then((next) => {
        if (active) setOrder(next);
      })
      .catch((e) => {
        if (active) onError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);
  const stateLabel = (state: string) =>
    order?.stateLabels?.[state]?.[locale.slice(0, 2)] ??
    order?.stateLabels?.[state]?.en ??
    o(state);
  const date = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
  return (
    <section>
      <div className="account-section-toolbar">
        <button className="account-text-button" onClick={onBack}>
          ← {a("backOrders")}
        </button>
        <button
          className="shop-secondary"
          disabled={busy || loading}
          onClick={() =>
            void run(async () => {
              const [next] = await Promise.all([
                shopApi<CustomerOrder>(path),
                reload?.(),
              ]);
              setOrder(next);
            })
          }
        >
          {a("refresh")}
        </button>
      </div>
      {loading ? (
        <p role="status">{a("loading")}</p>
      ) : (
        order && (
          <>
            <div className="account-detail-heading">
              <div>
                <small>{date(order.createdAt)}</small>
                <h2>{order.orderNumber}</h2>
              </div>
              <strong>{money(order.cart.price.totalPrice)}</strong>
            </div>
            <div className="account-status-grid">
              <div>
                <small>{a("orderStatus")}</small>
                <span className="account-badge">{stateLabel(order.state)}</span>
              </div>
              <div>
                <small>{a("paymentStatus")}</small>
                <span className="account-badge">
                  {stateLabel(order.payment.state)}
                </span>
                <small>{order.payment.method?.name}</small>
              </div>
            </div>
            <section className="account-panel">
              <h3>{a("subtotal")}</h3>
              {order.cart.lineItems.map((item) => (
                <div className="account-line-item" key={item.id}>
                  {item.media?.[0]?.url && (
                    <img src={item.media[0].url} alt="" />
                  )}
                  <div>
                    <strong>{item.label}</strong>
                    <small>× {item.quantity}</small>
                  </div>
                  <strong>{money(item.price.totalPrice)}</strong>
                </div>
              ))}
              <dl className="account-totals">
                <div>
                  <dt>{a("subtotal")}</dt>
                  <dd>{money(order.cart.price.positionPrice)}</dd>
                </div>
                <div>
                  <dt>{a("shipping")}</dt>
                  <dd>{money(order.cart.shippingCosts.totalPrice)}</dd>
                </div>
                <div>
                  <dt>{a("taxes")}</dt>
                  <dd>{money(order.cart.price.tax)}</dd>
                </div>
                <div>
                  <dt>{a("total")}</dt>
                  <dd>{money(order.cart.price.totalPrice)}</dd>
                </div>
              </dl>
            </section>
            <section className="account-panel">
              <h3>{a("shipping")}</h3>
              {!order.deliveries?.length ? (
                <p>{a("digitalOrder")}</p>
              ) : (
                order.deliveries.map((delivery, index) => (
                  <article className="account-delivery" key={index}>
                    <div className="account-order-heading">
                      <strong>{delivery.shippingMethod.name}</strong>
                      <span className="account-badge">
                        {stateLabel(delivery.state)}
                      </span>
                    </div>
                    <p>
                      {a("deliveryWindow")}:{" "}
                      {date(delivery.deliveryDate?.earliest)} –{" "}
                      {date(delivery.deliveryDate?.latest)}
                    </p>
                    {delivery.trackingCode ? (
                      <p>
                        {a("trackingCode")}:{" "}
                        <strong>{delivery.trackingCode}</strong>
                      </p>
                    ) : (
                      <p className="account-muted">{a("noTracking")}</p>
                    )}
                    {delivery.trackingUrl?.startsWith("https://") &&
                      safeRichUrl(delivery.trackingUrl) && (
                        <a
                          className="account-tracking"
                          href={delivery.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {a("trackShipment")} ↗
                        </a>
                      )}
                  </article>
                ))
              )}
            </section>
            <div className="customer-address-grid">
              <section className="account-panel">
                <h3>{c("billingAddress")}</h3>
                <AddressCard address={order.billingAddress} />
              </section>
              <section className="account-panel">
                <h3>{c("shippingAddress")}</h3>
                <AddressCard address={order.shippingAddress} />
              </section>
            </div>
            <section className="account-panel">
              <h3>{a("documents")}</h3>
              {!order.receipts?.length ? (
                <p className="account-muted">{a("noDocuments")}</p>
              ) : (
                order.receipts.map((receipt) => (
                  <div className="account-file" key={receipt.id}>
                    <div>
                      <strong>
                        {o(receipt.kind)} · {receipt.number}
                      </strong>
                      <small>{date(receipt.createdAt)}</small>
                    </div>
                    <button
                      className="shop-secondary"
                      disabled={busy}
                      onClick={() =>
                        void download(
                          `${path}/receipts/${encodeURIComponent(receipt.id)}/pdf`,
                        )
                      }
                    >
                      {a("download")}
                    </button>
                  </div>
                ))
              )}
            </section>
            {downloads.some((d) => d.orderId === id) && (
              <section className="account-panel">
                <h3>{a("downloads")}</h3>
                <AccountDownloads
                  downloads={downloads.filter((d) => d.orderId === id)}
                  download={download}
                  busy={busy}
                  onOrder={onOrder}
                />
              </section>
            )}
          </>
        )
      )}
    </section>
  );
}
