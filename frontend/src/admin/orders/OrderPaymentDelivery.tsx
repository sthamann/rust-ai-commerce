/** Payment jobs are observed until confirmation. Delivery actions share the server state machine. */
import { safeRichUrl } from "../../shared/content/rich-document";
import { useAccountText } from "../../shared/i18n/account-i18n";
import { useState } from "react";
import { useOperationsText } from "../../shared/i18n/operations-i18n";
import { usePaymentProviderText } from "../../shared/i18n/payment-provider-i18n";
import type { OrderAction } from "./OrderWorkflow";
export default function OrderPaymentDelivery({
  order,
  busy,
  rights,
  onAction,
  onPayment,
  pendingJob,
  onCheck,
}: {
  order: any;
  busy: boolean;
  rights: string[];
  onAction: (a: OrderAction, tracking?: string, trackingUrl?: string) => void;
  onPayment: (operation: string, amount?: number) => Promise<boolean>;
  pendingJob: boolean;
  onCheck: () => void;
}) {
  const { o } = useOperationsText();
  const { a: accountText } = useAccountText();
  const [links, setLinks] = useState<Record<number, string>>({});
  const paymentText = usePaymentProviderText();
  const [tracking, setTracking] = useState<Record<number, string>>({});
  const [refund, setRefund] = useState("");
  const actions = order.workflow?.actions ?? [];
  const label = (a: OrderAction) =>
    o(
      a.kind === "payment"
        ? "markPaid"
        : a.state === "shipped"
          ? "markShipped"
          : "markDelivered",
    );
  return (
    <section className="studio-card order-fulfillment">
      <div className="section-heading">
        <h2>{o("payment")}</h2>
        <span className="operation-status">{o(order.payment.state)}</span>
      </div>
      <p>{o(order.payment.provider)}</p>
      {rights.includes("orders.write") &&
        actions
          .filter((a: OrderAction) => a.kind === "payment")
          .map((a: OrderAction) => (
            <button
              key={a.id}
              disabled={busy || !a.enabled}
              className="studio-primary"
              onClick={() => onAction(a)}
            >
              {label(a)}
            </button>
          ))}
      {rights.includes("payments.manage") && order.payment.attemptId && (
        <div className="payment-commands">
          <button
            disabled={busy || pendingJob}
            className="studio-secondary"
            onClick={() => void onPayment("reconcile")}
          >
            {o("reconcile")}
          </button>
          {order.payment.state === "authorized" &&
            (["capture", "void"] as const).map((operation) => (
              <button
                key={operation}
                disabled={busy || pendingJob}
                className="studio-secondary"
                onClick={() => void onPayment(operation)}
              >
                {paymentText(operation)}
              </button>
            ))}
          {["captured", "partially_refunded"].includes(order.payment.state) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onPayment("refund", Number(refund))) setRefund("");
              }}
            >
              <label>
                {o("refund")}
                <input
                  type="number"
                  min={1}
                  required
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                />
              </label>
              <button
                className="studio-secondary"
                disabled={busy || pendingJob || !refund}
              >
                {o("refundAction")}
              </button>
            </form>
          )}
          {pendingJob && (
            <button
              disabled={busy}
              className="studio-primary"
              onClick={onCheck}
            >
              {o("checkOperation")}
            </button>
          )}
        </div>
      )}
      <div className="delivery-divider" />
      <h2>{o("delivery")}</h2>
      {order.deliveries.length ? (
        order.deliveries.map((d: any, index: number) => (
          <div className="delivery-card" key={index}>
            <div className="section-heading">
              <strong>{o(d.shippingMethod.name)}</strong>
              <span className="operation-status">{o(d.state)}</span>
            </div>
            {d.trackingCode && <p>{d.trackingCode}</p>}
            {d.trackingUrl?.startsWith("https://") &&
              safeRichUrl(d.trackingUrl) && (
                <a
                  href={d.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {accountText("trackShipment")}
                </a>
              )}
            {rights.includes("orders.write") &&
              actions
                .filter(
                  (a: OrderAction) =>
                    a.kind === "delivery" && a.deliveryIndex === index,
                )
                .map((a: OrderAction) => (
                  <div key={a.id}>
                    {a.state === "shipped" && (
                      <>
                        <label>
                          {o("tracking")}
                          <input
                            value={tracking[index] ?? ""}
                            onChange={(e) =>
                              setTracking({
                                ...tracking,
                                [index]: e.target.value,
                              })
                            }
                            maxLength={100}
                          />
                        </label>
                        <label>
                          {accountText("trackingUrl")}
                          <input
                            type="url"
                            maxLength={2000}
                            value={links[index] ?? ""}
                            onChange={(e) =>
                              setLinks({ ...links, [index]: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    <button
                      disabled={busy || !a.enabled}
                      className="studio-primary"
                      onClick={() =>
                        onAction(
                          a,
                          tracking[index] ?? "",
                          links[index] ?? d.trackingUrl ?? "",
                        )
                      }
                    >
                      {label(a)}
                    </button>
                    {a.reason && <small>{o(a.reason)}</small>}
                  </div>
                ))}
          </div>
        ))
      ) : (
        <p>{o("digital")}</p>
      )}
    </section>
  );
}
